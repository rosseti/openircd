/**
 * openircd, a lightweight ircd written in javascript v8 with nodejs.
 * http://www.openbrasil.org/ - rede do conhecimento livre.
 *
 * $Id: replies.js 2 2010-08-11 14:33:13Z mdxico $
 */

exports.get = function(const_name) 
{
	var argv = exports.get.arguments;
	
	rpl = messages[const_name];
	
	if (rpl != undefined) 
	{
		var str = rpl.string;
		
		for (var i = 1; i < argv.length; i++)
			str = str.replace('$'+i, argv[i]);
		
		return str;
	}
	
	return false;
};

messages = 
{
	"RPL_WELCOME": 
	{ 
		string: "001 $1 :Welcome to the $2 Internet Relay Chat Network $3" 
	},
	"RPL_YOURHOST": 
	{ 
		string: "002 $1 :Your host is $2, running version $3"
	},
	"RPL_CREATED": 
	{
		string: "003 $1 :This server was created $2"
	},
	"RPL_MYINFO": 
	{
		string: "004 $1 $2 $3 $4 $5"
	},
	"RPL_ISON": {
		string: "303 $1 :$2"
	},
	"RPL_WHOISUSER": 
	{
		string: "311 $1 $2 $3 $4 * :$5"
	},
	"RPL_WHOISSERVER": 
	{
		string: "312 $1 $2 $3 :$4"
	},
	"RPL_ENDOFWHO": 
	{
		string: "315 $1 $2 :End of /WHO list."
	},
	"RPL_WHOISIDLE": 
	{
		string: "317 $1 $2 $3 $4 :seconds idle, signon time"
	},
	"RPL_ENDOFWHOIS": 
	{
		string: "318 $1 $2 :End of /WHOIS list."
	},
	"RPL_WHOISCHANNELS": 
	{
		string: "319 $1 $2 :$3"
	},
	
	"RPL_LISTSTART": {
		string: "321 $1 Channel :Users  Name"
	},
		
	"RPL_LIST": {
			string: "322 $1 $2 $3 :$4"
	},	
	"RPL_LISTEND": {
		string: "323 $1 :End of /LIST"
	},
	"RPL_TOPIC": 
	{
		string: "332 $1 $2 :$3"
	},
	"RPL_WHOREPLY": 
	{
		string: "352 $1 $2 $3 $4 $5 $6 $7 :$8 $9"
	},
	"RPL_NAMREPLY": 
	{ 
		string: "353 $1 = $2 :$3"
	},
	"RPL_ENDOFNAMES": 
	{
		string: "366 $1 $2 :End of /NAMES list."
	},
	
	"RPL_MOTD": 
	{
		string: "372 $1 :- $2"
	},
	"RPL_MOTDSTART": 
	{
		string: "375 $1 :- $2 Message of the Day - "
	},
	"RPL_ENDOFMOTD": {
		string: "376 $1 :End of /MOTD command."
	},
	"ERR_ERRONEUSNICKNAME": 
	{ 
		string: "432 $1 $2 :Erroneous nickname" 
	},
	"ERR_NICKNAMEINUSE": 
	{ 
		string: "433 $1 $2 :Nickname is already in use."
	}
};
