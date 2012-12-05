#!/usr/bin/env node

/**
 * openircd, a lightweight ircd written in javascript v8 with nodejs.
 * http://www.openbrasil.org/ - rede do conhecimento livre.
 * 
 * This project is based on ircd demo for jsconf.eu/2009 available on:
 * 	https://gist.github.com/a3d0bbbff196af633995
 *
 * This was written with Node version 0.1.98. An earlier version will not work 
 * 	with this script, however later versions might.
 *
 * $Id: ircd.js 6 2010-08-18 12:34:37Z mdxico $
 */

topic = "openircd, a lightweight ircd written in javascript v8 with nodejs.";
crlf = "\r\n";

ircd_version = "openircd-1.0";
created_time = null;

var net = require("net"),
	sys = require("sys"),
	config = require("./config"),
	replies = require("./src/replies"),
	motd	= require("./src/motd");

puts = sys.puts;
inspect = sys.inspect;

function unix_timestamp() {
	return parseInt(new Date().getTime().toString().substring(0, 10))
}

process.addListener('uncaughtException', function(e) {
	puts('Uncaught exception: '+e);
});

debugLevel = 1;

function debug (m) 
{
	if (debugLevel > 0) 
		puts(m);
}

function debugObj (m) 
{
	if (debugLevel > 0) 
		puts(inspect(m));
}

function simpleString (s) 
{
	if (s) return s.replace(/[^\w]/, "_", "g");
}

channels = {};
users = {};

// Channel structure
function Channel (name) 
{
	this.name = name;
	this.topic = topic;
	this.users = [];
}

// If a channel object for this channel doesn't exist yet, create it.
function lookupChannel (name) 
{
	if (channels[name]) 
		return channels[name];
		
	channels[name] = new Channel(name);
	return channels[name];
}

// broadcast to everyone except the person who sent the message
Channel.prototype.broadcastEveryoneElse = function (msg, from) 
{
	for (var j = 0; j < this.users.length; j++) 
	{
		var user = this.users[j];
		if (user == from) continue;
		user.sendMessage(msg, from);
	}
};

Channel.prototype.broadcast = function (msg, from) 
{
	this.broadcastEveryoneElse(msg, from);
	from.sendMessage(msg, from);
};

Channel.prototype.quit = function (user, msg) 
{
	for (var i = 0; i < this.users.length; i++) 
	{
		if (this.users[i] == user) 
		{
			this.users.splice(i, 1);
		}
	}
		
	this.broadcast("QUIT :" + (msg || "quit"), user);
	
	if (this.users.length == 0) {
		debug("removing channel: " + this.name);
		delete channels[this.name];
	}
};

Channel.prototype.privmsg = function (msg, user, type) 
{
	
	if (type == undefined) {
		type = "PRIVMSG";
	}
	
	this.broadcastEveryoneElse(type + " " + this.name + " :" + msg, user);
};

Channel.prototype.sendTopic = function (user) 
{
	user.sendMessage(replies.get("RPL_TOPIC", user.nick, this.name, this.topic));
};

Channel.prototype.sendNames = function (user) {
  
	var users = '';
	for (var i = 0; i < this.users.length; i++) {
		
		users += (this.users[i].nick + " ");
		if (users.length > 500) {
			user.sendMessage(replies.get("RPL_NAMREPLY", user.nick, this.name, users));
			users = '';
		}
	}
	
	user.sendMessage(replies.get("RPL_NAMREPLY", user.nick, this.name, users));
	user.sendMessage(replies.get("RPL_ENDOFNAMES", user.nick, this.name));
};

Channel.prototype.sendWho = function (user) 
{
	for (var i = 0; i < this.users.length; i++) 
	{
		var u = this.users[i];

		user.sendMessage(replies.get("RPL_WHOREPLY", user.nick, this.name, 
			u.names.user, u.vhost, u.server.name, u.nick, "@", "0", u.names.real));
	}
	
	user.sendMessage(replies.get("RPL_ENDOFWHO", user.nick, this.name));
};

Channel.prototype.join = function (user) 
{

	debug("JOIN. user list: " + this.inspectUsers());
	
	for (var i = 0; i < this.users.length; i++) 
	{
		if (this.users[i] == user) 
			return false;
	}

	this.users.push(user);
	
	this.broadcast("JOIN :" + this.name, user);

	this.sendNames(user);

	this.sendTopic(user);

	debug("AFTER JOIN. user list: " + this.inspectUsers());

	return true;
};

Channel.prototype.inspectUsers = function () 
{
	return inspect(this.users.map(function (user) { return user.nick; }));
}

Channel.prototype.part = function (user) 
{
	var packet = "PART " + this.name + " :";

	debug("PART. user list: " + this.inspectUsers());

	for (var i = 0; i < this.users.length; i++) 
	{
		if (this.users[i] == user) 
		{
			this.users.splice(i, 1);
			user.sendMessage(packet, user);
			break;
		}
	}

	debug("After PART. user list: " + this.inspectUsers());

	this.broadcast(packet, user);
	
	if (this.users.length == 0) {
		debug("removing channel: " + this.name);
		delete channels[this.name];
	}
};

function normalizeChannelName (channelName) 
{
	if (channelName) {
		return channelName.replace(/[^\w]/, "_", "g")
			      .toLowerCase()
			      .replace(/^_+/, "#");
	}
}

/**
 * User struct
 */
function User (socket) 
{
	this.socket = socket;
	
	this.server = 
	{
		name:	null,
		description: null
	};
	
	this.last_msg_time = null;
	this.signon_time = null;
	this.channels = [];
	this.registered = false;
	this.vhost = null;
	this.nick = null;
	this.names = {};
	this.names = { user: "x"
		, host: "x"
		, server: "x"
		, real: "x"
		};
}

User.prototype.raw = function (msg) 
{
	if (this.socket.readyState !== "open" && this.socket.readyState !== "writeOnly") {
		return false;
	}
	
	var packet = msg + crlf;
	
	debug("send " + ": " + inspect(packet));
	
	this.socket.write(packet, "utf8");
}

User.prototype.sendMessage = function (msg, from) 
{
	if (this.socket.readyState !== "open" && this.socket.readyState !== "writeOnly") {
		return false;
	}
	
	var prefix;
	
	if (from) {
		prefix = from.prefix();
	} else {
		prefix = config.server.name;
	}
	
	// TODO check if the socket is writable!
	if (!this.socket.writable)
		return;
	
	var packet = ":" + prefix + " " + msg + crlf;
	
	if (this.nick) 
	{
		debug("send to " + this.nick + ": " + inspect(packet));
	} else 
	{
		debug("send " + ": " + inspect(packet));
	}
	
	this.socket.write(packet, "utf8");
};

User.prototype.prefix = function () {
	// <prefix> ::=
	// <config.server.name> | <nick> [ '!' <user> ] [ '@' <host> ]
	return this.nick + "!" + this.names.user + "@" + this.vhost;
};

User.prototype.join = function (channelName) 
{
	var channelName = normalizeChannelName(channelName);
	
	for (var i = 0; i < this.channels.length; i++) {
		// check if the user is already in this channel.
		if (channelName == this.channels[i].name) 
			return;
	}
	
	var channel = lookupChannel(channelName);
	
	if(channel.join(this)) 
	{
		this.channels.push(channel);
	}
};

User.prototype.sendMotd = function () 
{
	if (motd.lst.length > 0) 
	{
		this.sendMessage(replies.get("RPL_MOTDSTART", this.nick, config.server.name));
		
		for (var i in motd.lst) {
			this.sendMessage(replies.get("RPL_MOTD", this.nick, motd.lst[i]));
		}
		
		this.sendMessage(replies.get("RPL_ENDOFMOTD", this.nick));
	}
}

User.prototype.maybeRegister = function () 
{
	if (this.nick && this.names && !this.registered) 
	{
		var host = config.server.name + '[' + config.listen.host + '/' + config.listen.port + ']';

		this.vhost 			= "unregistered/"+this.nick;

		this.server.name 	= config.server.name;
		this.server.description = config.server.description;
      	
		this.sendMessage(replies.get("RPL_WELCOME", this.nick, config.network.name, this.nick));
		this.sendMessage(replies.get("RPL_YOURHOST", this.nick, host, ircd_version))
		this.sendMessage(replies.get("RPL_CREATED", this.nick, created_time.toUTCString()));
		this.sendMessage(replies.get("RPL_MYINFO", this.nick, config.server.name, ircd_version, "iox", "ov"));
		
		this.registered = true;	
		
		this.sendMotd();
	}
}

// sends a message to all users in all channels that the user belongs to
User.prototype.broadcast = function (msg) 
{
	for (var i = 0; i < this.channels.length; i++) 
	{
		this.channels[i].broadcast(msg, this);
	}
};

User.prototype.changeNick = function (newNick) 
{	
	if (newNick.length > 30 || /^[a-zA-Z]([a-zA-Z0-9_\-\[\]\\`^{}]+)$/.exec(newNick) == null) 
	{
		debug(newNick);
		this.sendMessage(replies.get("ERR_ERRONEUSNICKNAME", '*', newNick));	
		return;
	}
		
	if (users[newNick]) 
	{
		if (users[newNick] == this) 
			return;
					
		this.sendMessage(replies.get("ERR_NICKNAMEINUSE", '*', newNick));
		
		return;
	}
	
	debug("Got NICK: " + inspect(newNick));
	
	if (this.nick) 
	{
		var packet = "NICK :" + newNick;
	
		this.broadcast(packet, this);
	
		delete users[this.nick];
		users[newNick] = this;
		this.nick = newNick;

	} else 
	{
		users[newNick] = this;
		this.nick = newNick;
	}

	this.maybeRegister();
};

User.prototype.privmsg = function (target, msg, type) 
{
	this.last_msg_time = unix_timestamp();

	if (type == undefined) {
		type = "PRIVMSG";
	}
	
	if (target.charAt(0) == "#") 
	{
		var channelName = normalizeChannelName(target);
		for (var i = 0; i < this.channels.length; i++) {
			// make sure the user is in that channel.
			if (channelName == this.channels[i].name) {
				this.channels[i].privmsg(msg, this, type);
				return;
			}
		}
	} else if (users[target]) {
		var user = users[target];
		user.sendMessage(type + " " + user.nick + " :" + msg, this);
	}
};

User.prototype.part = function (channelName) 
{
	channelName = normalizeChannelName(channelName);
	
	for (var i = 0; i < this.channels.length; i++) 
	{
		if (this.channels[i].name == channelName) 
		{
			this.channels.splice(i, 1);			
			break;
		}
	}
	
	if (channels[channelName]) {
		channels[channelName].part(this);
	}
  
};

User.prototype.quit = function (msg)
{
	clearInterval(this.ping_timer);
	
	while (this.channels.length > 0) {
		this.channels.pop().quit(this, msg);
	}
	
	this.socket.end();
	
	delete users[this.nick];
};

User.prototype.parse = function (message) 
{
	var match = /^(\w+)(?:\s+)?(.+)?$/.exec(message);
	
	if (!match) 
	{
		debug("cannot parse: " + inspect(message));
		return;
	}
	
	var command = match[1].toUpperCase();
	var rest 	= match[2];
	
	switch (command) 
	{
		case "NICK":
			var newNick = rest.replace(/^\:/, '');
			this.changeNick(newNick);
			break;
		
		case "USER":
			
			match = /^([^\s]+)\s+([^\s]+)\s+([^\s]+)(\s+:(.*))?$/.exec(rest);
			
			if (!match) return;
			
			this.names = { user: simpleString(match[1])
						, host: simpleString(match[2])
						, server: simpleString(match[3])
						, real: simpleString(match[5])
			};
			
			debug("Got USER: ");
			debugObj(this.names);
			
			this.maybeRegister();
			
			break;
		
		case "LIST":			
		
			this.sendMessage(replies.get("RPL_LISTSTART", this.nick));
					
			for (var i in channels) 
			{
				var channel = channels[i];
				this.sendMessage(replies.get("RPL_LIST", this.nick, channel.name, 
					channel.users.length, channel.topic));
			}
			
			this.sendMessage(replies.get("RPL_LISTEND", this.nick));
			
			break;
		
		case "TOPIC":
			var matches = /^([^\s]+)\s+:(.*)$/.exec(rest);
			if (!match) 
				return; // ignore
		
			var channelName = normalizeChannelName(matches[1]);
			var ptopic 		= matches[2];
			
			// TODO send err message
			if (!channels[channelName]) {
				return;
			}
			
			var channel = channels[channelName];
			channel.topic = ptopic;
			
			var packet  = "TOPIC " + channel.name + " :" + channel.topic;
			
			channel.broadcast(packet, this);
			
			break;
		
		case "JOIN":
			var args = rest.split(/\s/);
			var chans = args[0].split(",");
			
			for (var i = 0; i < chans.length; i++) 
			{
				this.join(chans[i]);
			}
			
			break;
		
		case "PART":
			var args = rest.split(/\s/);
			var chans = args[0].split(",");
			
			for (var i = 0; i < chans.length; i++) 
			{
				this.part(chans[i]);
			}
			
			break;
			
		case "NAMES":
			var args = rest.split(/\s/);
			var channelNames = args[0].split(",");
			
			for (var i = 0; i < channelNames.length; i++) 
			{
				var channelName = normalizeChannelName(channelNames[i]);
			
				if (channels[channelName]) 
				{
					channels[channelName].sendNames(this);
				}
			}
			
			break;
		  
		case "MOTD":
			this.sendMotd();
			break;
			
		case "WHO":
			var args = rest.split(/\s/);
			var channelName = normalizeChannelName(args[0]);
						
			if (channels[channelName]) 
			{				
				channels[channelName].sendWho(this);
			}
			
			break;
		  
		case "WHOIS":
		
			var args = rest.split(/\s/);
			var nickname = simpleString(args[0]);
			var target = users[nickname];
			var c = Array();
			
			if (target) 
			{
				for (var i in target.channels) {
					c.push(target.channels[i].name);
				}
			
				this.sendMessage(replies.get("RPL_WHOISUSER", this.nick, target.nick, 
					target.names.user, target.vhost, target.names.real));
					
				this.sendMessage(replies.get("RPL_WHOISSERVER", this.nick, 
					target.nick, target.server.name, target.server.description));
				
				if (c.length > 0) {
					this.sendMessage(replies.get("RPL_WHOISCHANNELS", this.nick, 
						target.nick, c.join(" ")));
				}
				
				this.sendMessage(replies.get("RPL_WHOISIDLE", this.nick, target.nick, 
					(unix_timestamp() - target.last_msg_time), target.signon_time));
					
				this.sendMessage(replies.get("RPL_ENDOFWHOIS", this.nick, target.nick));
			}
		
		break;
		
		case "PRIVMSG":
			var matches = /^([^\s]+)\s+:(.*)$/.exec(rest);
			if (!match) return; // ignore
			var target = matches[1];
			var message = matches[2];
			this.privmsg(target, message);
			break;
			
		case "NOTICE":
			var matches = /^([^\s]+)\s+:(.*)$/.exec(rest);
			if (!match) return; // ignore
			var target = matches[1];
			var message = matches[2];
			this.privmsg(target, message, 'NOTICE');
			break;
		
		case "PING":
			var servers = rest.split(/\s/);
			this.sendMessage("PONG " + config.server.name);
			break;
		
		case "QUIT":
			var matches = /^:(.*)$/.exec(rest)
			this.quit(matches ? matches[1] : "");
			break;
		
		case "ISON":
			var searchNicks = rest.split(/\s/);
			var onlineNicks = Array();
			
			for (var i in searchNicks) {
				var searchNick = simpleString(searchNicks[i]);
				
				if (users[searchNick]) {
					onlineNicks.push(users[searchNick].nick);
				}
			}
			
			this.sendMessage(replies.get("RPL_ISON", this.nick, onlineNicks.join(" ")));
			
			break;
			
			
		case "LUSERS":
		case "MODE":
		case "CAP":
		case "USERHOST":
			break;
			
		case "PONG":
			debug("received pong from: " + this.nick);
			break;
		
		default:
			debug("Unhandled message: " + inspect(message));
			this.sendMessage("421 " + command + " :Unknown command");
			break;
	}
};

server = net.createServer(function (socket) 
{
	socket.setTimeout(config.general.ping_timeout * 60 * 1000); 
	socket.setEncoding("UTF8");
	
	var user = new User(socket);
	var buffer = "";
	
	socket.addListener("connect", function () 
	{
		user.last_msg_time	= unix_timestamp();
		user.signon_time	= unix_timestamp();
		user.raw("NOTICE AUTH :*** Processing your connection ...");
	});
	
	socket.addListener("data", function (packet) 
	{
		buffer += packet;
		
		var i;
		
		while (i = buffer.indexOf("\n")) 
		{
			if (i < 0) break;

			var message = buffer.slice(0, i).replace(/\r$/,'');
			
			if (message.length > 512) {
				user.quit("flooding");
			} else {
				user.parse(message);
				buffer = buffer.slice(i+1);
			}
		}

	});
	
	socket.addListener("end", function (packet) {
		user.quit("connection reset by peer");
	});
	
	socket.addListener("timeout", function (packet) {
		user.quit("idle timeout");
	});
});

created_time = new Date();

motd.rehash();

server.listen(config.listen.port, config.listen.host);
puts("ircd.js on port " + config.listen.port);

repl = require("repl");
repl.start("ircd> ");

