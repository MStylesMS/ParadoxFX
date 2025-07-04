//////////////////////////////////////////////////////
//    ______  ___  ______  ___ ______ _______   __  //
//    | ___ \/ _ \ | ___ \/ _ \|  _  \  _  \ \ / /  //
//    | |_/ / /_\ \| |_/ / /_\ \ | | | | | |\ V /   //
//    |  __/|  _  ||    /|  _  | | | | | | |/   \   //
//    | |   | | | || |\ \| | | | |/ /\ \_/ / /^\ \  //
//    \_|   \_| |_/\_| \_\_| |_/___/  \___/\/   \/  //
//--------------------------------------------------//
//                                                  //
// Copyright(c) 2019-2021 Paradox Productions, LLC. //
//                                                  //
//////////////////////////////////////////////////////
// ===================================================
// ImageSwitcher (Node.js)
// ---------------------------------------------------
// This app allows pictures and video to be played
// full screen on a remote Pi via MQTT commands.
// ---------------------------------------------------
// utils.js: Utilities.
exports.isStringNonEmpty = function isStringNonEmpty(str) {
  return typeof str === 'string' && str.length !== 0;
};

exports.parseNumberOr = function parseNumberOr(str, defaultValue) {
  var value = parseFloat(str);
  return isFinite(value) ? value
                         : defaultValue;
};

const quotedRegex = /^'((?:[^'\\]|\\.)*)'$/;
const stringRegex = /^"(?:[^"\\]|\\.)*"$/;
const varRegex = /^[A-Z][A-Z0-9_]*$/;
const atomRegex = /^[\p{L}0-9_][\p{L}0-9_:,.]*$/u;
const tokenPatterns = 
`    '(?:[^'\\\\]|\\\\.)*'
    |"(?:[^"\\\\]|\\\\.)*"
    |[\\p{L}0-9_][\\p{L}0-9_:,.]*
    |[;=]
`.replace(/\s+/g,'');

class Lexer {
    constructor(text) {
        this.tokenRegexp = new RegExp(tokenPatterns, 'gu');
        this.text = text;
    }

    *parse(text) {
        var tokenRegexp = this.tokenRegexp;
        var match;
        text || (text = this.text);
        this.text = text;
        tokenRegexp.lastIndex = 0;
        while ((match = tokenRegexp.exec(text)) !== null) {
            yield match[0];
        }
    }
}

exports.parseChannelMap = function parseChannelMap(source, args) {
  var current, channel, vars, varname;
  const res = new Map();
  const lexer = new Lexer(source);
  const tokens = lexer.parse();
  const argvars = new Map(
    Object.keys(args).filter(name => varRegex.test(name))
                     .map(name => ['$' + name, args[name]]));

  function next() {
    var next = tokens.next();
    current = next.value;
    return !next.done;
  }

  function parseVar() {
    var name = current;
    return varRegex.test(name) ? ('$' + name) : null;
  }

  function parseAtom() {
    var atom = current;
    if (!atomRegex.test(atom)) {
        return parseQuoted();
    }
    return atom;
  }

  function parseQuoted() {
    var atom = current
      , match = atom.match(quotedRegex);
    return match ? match[1] : parseString();
  }

  function parseString() {
    var atom = current;
    if (stringRegex.test(atom)) {
        return JSON.parse(atom)
    }
    return null;
  }

  while (next()) {
    if (current === ';') {
      if (vars) {
        res.set(channel, vars);
        channel = vars = null;
        continue;
      }
      else {
        throw new Error("expected a channel definition");
      }
    }
    else if (current === '=') {
      if (!vars) throw new Error("expected a channel name");
      if (!varname) throw new Error("expected a variable name");
      let value = next() && parseAtom();
      if (value == null) throw new Error("expected a variable value");
      vars.set(varname, value);
      varname = value = null;
    }
    else if (vars) {
      if (varname) throw new Error("expected =value");
      varname = parseVar();
      if (!varname) throw new Error("expected a variable name");
      if (!argvars.has(varname)) throw new Error("unkown variable name: " + varname);
    }
    else {
      channel = parseAtom();
      if (!channel) throw new Error("expected a channel definition");
      vars = new Map(argvars);
    }
  }

  if (vars) {
    res.set(channel, vars);
  }

  return res;
};
