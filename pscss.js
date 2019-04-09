// Partial scss (pscss) to css client-side converter by Nicolas de Jong
//
// V1.0/20180607 - initial version
//
// This is a small and simple client side partial scss preprocessor with limited functionality.
// For more client-side css-preprocessing power, take a look at postcss or less.
// They are a lot bigger, but have many more conversions.
//
// The code is kept small by using regex instead of proper tokenization.
// This works quite well, but there are some corner cases where conversion fails.
// That typically happens with unmatched quotes in remarks.
// See the test files for examples.
//
// Notes:
// - Nesting is scss-compatible.
// - Loading of pscss is not working for "file:" urls due to browsers being paranoid.
//   Use a (local) file-server or inline instead.
//
// Versions:
//
// The basic ncss version (1KB) just adds nesting. If all you want is css nesting, use this one.
// The pscss version (5KB) adds a some scss features that may just work for simple scss.
//
// ncss adds features to css for LINK and STYLE nodes of type "text/ncss" and "text/scss":
// - 1.3KB minimized
// - supports nesting css like scss except property nesting.
// - @import is not supported for ncss
// - ncss.js script loading must be last in HEAD
//
// pscss has the following extras:
// - 6KB minimized
// - support for single-line comments
// - supports nested comments (opt-in using the "nc" flag)
// - supports $variables by renaming them to css variables
// - supports nested properties
// - supports @import of pscss (just not with file:// protocol because browsers don't allow it)
// - supports @import on any level: '@import "name";' (where name starts with '_' (not part of real name) or ends with '.p?[sn]css')
// - @media will always be promoted to top level, so can be defined deeper, as in scss.
// - supports basic scss @mixin with args but without logic or maps. Use @include to use mixin.
// - has 'expose' flag attribute that exposes extra converter and function plugins, and pscss to css conversion function
// - has 'watch' flag attribute that watches for DOM changes for new pscss LINK or SCRIPT nodes after loading.
// - has 'files' attribute to load one or more pscss resources (instead of multiple LINKs)
// - pscss.js script loading can be anywhere in HEAD (so not only at end as with ncss)
//
// How to use:
//
//  <link  type="text/scss" href="your-styles.scss" rel="stylesheet">
//  <style type="text/scss" href="your-styles.scss"></script>
//
// and load this script: <script src="pscss.js" [nc expose watch files=...]></script> somewhere in head.
//
// Optional script attributes
// - nc      Allow nested multi-line comments (/* .. /* .. */ .. */) in the pscss
// - watch   Watch for dynamically added link or style tags of type text/p?[sn]css to the DOM
// - files   Comma separated list of pscss files to load (can also be given in body of script tag)
// - expose  Makes 'pscss' global (on window) with the following contents:
//             - convertToCss(pscssText: string): string
//             - converters[]: (pscss: string, quotes:string[], vars:{string:string}, mixins:{string:string}) => string
//             - functions{}: string : (pscss: string, args: string[], context:{quotes:string[]}) => string
//             - options{}: string : string|boolean (from script attributes)
//           The converters and functions are initially empty but can be extended.
//           Adding converters or functions should be done before styles are loaded (move to beginning of head)

// TODO:
// - @extend
// - works with CDATA?
// - error line numbers are shifted
// - async?

(function(globals) {
const undash       = s => s.replace(/-(.)/g, (m,g) => g.toUpperCase());
const usToDash     = s => s.replace(/_/g, '-');
const isSourceNode = node => /STYLE|LINK/.test((node||{}).nodeName) && /^text\/p?[sn]css/.test(node.type);
const watchForPscss= () => watchHandle || (watchHandle = new MutationObserver(mutations => {
                             mutations.forEach(m => m.addedNodes.forEach(n => !isSourceNode(n) || flattenPscss(n)));
                           }).observe(document, { childList:true, subtree:true }));
const stopWatch    = () => { !watchHandle || watchHandle.disconnect(); watchHandle = null; };
const urlFromNode  = node => node.getAttribute('href') || node.getAttribute('src');
const syncLoad     = nodeOrUrl => {
  if(nodeOrUrl.nodeName && !(nodeOrUrl = urlFromNode(nodeOrUrl))) return '';
  let url = nodeOrUrl;
  if(url.startsWith('_')) url = url.substr(1);
  if(loadedUrls.has(url)) return '';
  loadedUrls.add(url); // prevent duplicate loads & circular imports

  // synchronized load because a <link ...> call would block as well
  // also used for @imports.
  const request = new XMLHttpRequest();
  request.open('GET', url, /*async=*/false);
  try { request.send(); } catch(e) {} // prevent stack trace in console

  if (request.status === 200) return request.responseText;
  console.error('failed to load:', url);
  return '';
};
const flattenPscss = (styleNodeOrText, name) => {
  let text;
  let node;

  if(styleNodeOrText.nodeName) {
    node = styleNodeOrText;
    text = node.textContent || syncLoad(node);
    name = urlFromNode(node);
  } else text = styleNodeOrText;

  const newNode = document.createElementNS((node || {}).namespaceURI, 'style');
  newNode.type = 'text/css';
  newNode.textContent = convertPscssTextToCss(text, null, name);

  if(node) {
    if(node.media) newNode.setAttribute('media', node.media);
    node.parentNode.replaceChild(newNode, node);
  } else document.head.appendChild(newNode);
};
const convertPscssTextToCss = (cssWithNesting, rootSelector, baseUrl) => {
  const tokens = [];
  const quotes = [];
  const vars   = {};
  const mixins = {};

  const stringPipe         = (input, ...funcs) => flatten(funcs).reduce((result, func) => func.call(options, result, quotes, vars, mixins) || '', input);
  const indexOf            = (s, textOrRegExp, offset=0) => {
    if(typeof textOrRegExp === 'string') return s.indexOf(textOrRegExp, offset);
    const result = (textOrRegExp.exec(s.substring(offset)) || {index:-1}).index;
    return result < 0 ? result : result + offset;
  };
  const flatten            = array => array.reduce((acc, val) => acc.concat(Array.isArray(val)?flatten(val):val), []);
  const line               = (s, offset) => { const l = s.substr(0, offset||0).split(/\n/).length; return l ? `${l+1}: ` : ' '; };
  const warn               = (...msg) => console.warn(`${baseUrl ? baseUrl : 'pscss'}:` + msg.join(' ')) || '';
  const removeNested       = (s, begin, end, prefix='', blockHandler=null) => {
    let block;
    while(0 <= (block = indexOf(s, prefix || begin))) {
      let openIndex = s.indexOf(begin, block);
      let closeIndex = s.indexOf(end, block);
      for(;;) {
        let bo2 = s.indexOf(begin, openIndex + begin.length);
        if(bo2 > openIndex && bo2 < closeIndex) { openIndex = bo2; closeIndex = s.indexOf(end, closeIndex + end.length); } else break;
      }
      let newBlock = '';
      if(blockHandler) newBlock = blockHandler(s.substring(block, closeIndex+end.length, block)) || '';
      s = s.substr(0, block).trim() + newBlock + s.substring(closeIndex+end.length);
    }
    return s;
  };

  const fixNewlines        = s => s.replace(/\r\n|\r/g, '\n');
  const storeQuotes        = s => s.replace(/(['"])(.*?[^\\])?\1/g, q => qprefix + quotes.push(q));
  const restoreQuotes      = s => s.replace( new RegExp(qprefix + '(\\d+)', 'g'), (m, n) => quotes[n-1]);
  const removeRemarks      = s => (options.nc ? removeNested(s, "/*", "*/") : s.replace( /\/\*[\s\S]*?\*\//g, '')).replace( /\/\/[^\n]*/g, '');
  const handleImports      = (s, quotes, vars, mixins) => {
    return s.replace(new RegExp('@import\\s*' + qprefix + '(\\d+)(\s*;)?', 'g'), (m,n) => {
      const importUrl = quotes[n-1].replace(/^(.)(.*)\1$/, '$2');
      if(!/^_|\.p?[sn]css$/.test(importUrl)) return m;
      const url = (baseUrl || '/.').replace( /\/[^\/]+$/, '/' + importUrl).replace(/^\//,'');
      return stringPipe(syncLoad(url), fixNewlines, storeQuotes, removeRemarks, s => handleImports(s, url));
    });
  };
  const fixMissingSc       = s => s.replace(/(\w+\s*:\s*[\w"']+)( *[}\n])/g, (m, g1, g2, offset) => {
    warn(line(s,offset) + `missing semicolon for "${g1}"`);
    return g1 + ';' + g2;
  });
  const replaceNestedProps = s => s.replace(/([\w_-]+)\s*:\s*{([^}]+)}/, (_, main, subs) => subs.replace(/([\w-_]+)\s*:/g, (_,name) => main + '-' + name + ':'));
  const scoopMixins        = s => removeNested(s, "{", "}", "@mixin", (mixin, offset) => {
    const [, name, args, body] = /^@mixin\s+([\w_-]+)(?:\s*\(([^)]+)\))?\s*{([\s\S]+)}$/.exec(mixin);
    if(mixins[usToDash(name)]) warn(line(s, offset) + `duplicate @mixin "${name}"`); else
    mixins[usToDash(name)] = { name, args:args?args.split(arraySep).map(a=>a.split(/\s*:\s*/)):[], body:body };
  });
  const replaceIncludes    = s => {
    const outputMixin = (name, args, contentOrOffset, rnames) => {
      if(rnames.has(usToDash(name))) return warn(` endless recursion in @mixin "${name}"`); rnames.add(usToDash(name));
      const mixin = mixins[usToDash(name)];
      if(!mixin) { return warn(` unknown @include mixin: "${name}"`); }
      const reDots = /\.{3}$/;
      args = flatten((args ? args.split(arraySep) : []).map((arg, index) => reDots.test(arg) ? (vars[arg.replace(reDots,'').replace(/^\$/,'')]||'').split(arraySep): arg));
      args = args.map((arg, index) => reDots.test((mixin.args[index]||[])[0]) ? args.slice(index).join(', '): arg );
      let text = replace(mixin.body, rnames);
      let last = '0';
      mixin.args.forEach(([name, def], index) => {
        name = name.replace(reDots, '');
        text = text.split(name).join(last = (args[index] || def || last))
      });
      return text.replace(/@content\s*;?\s*/, typeof contentOrOffset === 'string' ? contentOrOffset : '');
    };
    const replace = (text, rnames) => stringPipe(text,
      text => text.replace(/\s*@include\s+([\w_-]+)(?:\s*\(([^)]+)\))?\s*;\s*/g, (_, name, args, coff) => outputMixin(name, args, coff, rnames || new Set())),
      text => removeNested(text, '{', '}', /@include\s+[^{\s+]/, block => {
        const ex = /^@include\s+([\w_-]+)(?:\s*\(([^)]+)\))?\s*{([\s\S]*)}$/.exec(block);
        return outputMixin.call(null, ex[1], ex[2], ex[3], rnames || new Set());
      })
    );
    return replace(s);
  };
  const runFunctions       = s => s.replace(/([\w-_]+)\(([^);]*)\)/g, (match, name, args) => (pscss.functions[name]||(()=>match)).call(pscss, args.split(arraySep)) || 0);
  const tokenize           = s => s.replace(/([\s\S]*?)([;{}])/g, (_, g1, g2) => tokens.push.apply(tokens, [g1, g2].map(s=>s.trim()).filter(s=>!!s)));
  const scssVarsToCss      = s => s.replace(/\$([-\w$]+)(\s*:\s*)(.+?);/g, (_, name, g2, val) => {
     vars[name] = /^\$/.test(val) ? vars[val.substring(1)] : val;
     return `--${name}${g2}${val};`;
  }).replace(/\$([-\w$]+)(\s+!important)?(\s*;)/g, 'var(--$1)$2$3');
  const flattenRules       = () => {
    const reduceStyles = (styles, braced) => braced ? ` { ${styles.join(' ')} }` : styles.join('\n') + '\n';
    const addRules = (rules, selectors, styles) => {
      const joinSelectors = (a, b) => {
        if(mediaRE.test(b)) {
          if(!a.trim()) return b + ' { ';
          const t = a;//.replace(/^&/,'');
          if(mediaRE.test(a)) return a.split(/{/)[0].trim() + ' ' + b.replace(/@media/, 'and').trim() + ' { ' + (a.split(/{/)[1]||'').trim();
          a = b + ' {';
          b = t;
        }
        return b.includes('&') ? b.replace(/^(.*)&/, (_, prefix) => prefix ? prefix + ' ' + a : a) : a + ' ' + b;
      };
      rules.push([selectors, styles]);
       for(let token=';'; token; token=tokens.shift()) {
        if (token === '}') return rules;
        if (tokens[0] === '{') {
          tokens.shift();
          let deeperSelectors = flatten(token.split(arraySep).map(tsel => selectors.map(sel => joinSelectors(sel, tsel))));
          let deeperStyles = [];
          addRules(rules, deeperSelectors, deeperStyles);
          if(deeperSelectors.some(ds=>mediaRE.test(ds)) && deeperStyles.length) deeperStyles.push('}');
        } else if(token !== ';') {
          styles.push(token + ';');
        }
      }
      return rules;
    };
    const ruleToString = (selectors, styles) => {
      const nested = selectors[0];
      if(nested) {
        return selectors + reduceStyles(styles, true);
      }
      // vars at LL0 are not supported by css
      const isVar = s => /^(\$|--|var\().*/.test(s);
      const vars = styles.filter(isVar);
      const rest = styles.filter(s => !isVar(s));
      return (rest.length ?           reduceStyles(rest, false) : '')
           + (vars.length ? ':root' + reduceStyles(vars, true ) : '');
    };
    return addRules([], rootSelector ? [rootSelector] : [''], [])
      .filter(([selectors, styles]) => selectors.length && styles.length)
      .map(([selectors, styles]) => ruleToString(selectors, styles))
      .join('\n');
  };

  // A tradeoff is made here: no real tokenization is used which leads to much smaller code.
  // However there are some corner cases where this doesn't work well:
  // For example multiple multiline-remarks on a single line, each containing a single quote:
  //
  // > before remains/*single quote'*/this will be ignored/*single quote'*/after remains
  //
  return stringPipe(cssWithNesting || '',
    fixNewlines,
    storeQuotes, removeRemarks, handleImports, fixMissingSc,
    replaceNestedProps, scoopMixins, scssVarsToCss, replaceIncludes,
    pscss.converters, runFunctions,
    tokenize, flattenRules, restoreQuotes
  );
};

const qprefix    = '==:Q:=='; // beware of chars not allowed in regex
const scriptNode = document.currentScript || {};
const loadedUrls = new Set();
const options    = Array.from(scriptNode.attributes||[]).reduce((obj, attr) => { obj[undash(attr.nodeName)]=attr.textContent || true; return obj; }, {});
const arraySep   = /\s*[\n,]+\s*/;
const mediaRE    = /@media/;
const urls       = (scriptNode.innerText||'').split(arraySep)
                     .concat((options.files || '').split(arraySep))
                     .filter(n=>!!n && typeof n === 'string');
const pscss = {
  convertToCss: convertPscssTextToCss,
  getVar: (name, el) => (el || document.body).style.getPropertyValue('--' + name) || getComputedStyle(el || document.body).getPropertyValue('--' + name),
  setVar: (name, value, el) => (el || document.body).style.setProperty('--' + name, value),
  converters: [],
  functions: {},
  options,
  quotePrefix: qprefix
};
if(options.expose) globals.pscss = pscss;
let watchHandle;

// react to styles/links of type 'text/p?[sn]css'
watchForPscss();
if(!options.watch) window.addEventListener('load', () => stopWatch());

// flatten p?[sn]css urls & existing
if(urls.length) urls.forEach(url => flattenPscss(syncLoad(url), null, url));
['text/ncss','text/pscss','text/scss'].forEach(type => {
  document.querySelectorAll(`style[type="${type}"], link[type="${type}"]`).forEach(flattenPscss);
});
})(this || window);
