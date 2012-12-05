/**
 * openircd, a lightweight ircd written in javascript v8 with nodejs.
 * http://www.openbrasil.org/ - rede do conhecimento livre.
 * 
 * $Id: config.js 6 2010-08-18 12:34:37Z mdxico $
 */

exports.listen = {
	port: 6667,
	host: '0.0.0.0'
};

exports.server = {
	name: "experimental.openbrasil.org",
	description: "servidor experimental openbrasil",
};

exports.network = {
	name: "openbrasil"
};

exports.general = {
	ping_timeout: 1
};
