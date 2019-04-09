const removeRemarks = s => s.replace( /\/\*[\s\S]*?\*\//g, '') // remove multiline remarks
                            .replace( /\/\/[^\n]*/g, '');      // remove singleline remarks
const normalize = s => removeRemarks(s || '').replace(/(\s)\s+/g, '$1').replace(/^\s+/mg, '').replace(/\r\n/g, '\n');
const generated = normalize((document.querySelector('style[type="text/css"]') || {}).textContent);
const expected  = normalize((document.querySelector('style[type="text/css-expected"]') || {}).textContent);
const testName  = location.pathname.split('/').pop().split('.', 2)[0];
const log       = (...items) => console.log(testName + ']', ...items);
let ok;
let diff = [];

window.addEventListener('load',() => {
  function addStyles(node, styles) {  Object.keys(styles || {}).forEach(sname => node.style[sname] = styles[sname]); }
  function addNode(parent, name, styles, textContent) {
    const node = document.createElement(name);
    addStyles(node, styles);
    if(textContent) node.textContent = textContent;
    (parent || document.body).appendChild(node);
    return node;
  }
  addStyles(document.body, {
    whiteSpace: 'pre', fontFamily: 'Consolas, monospace',
    display:'grid', gridTemplateColumns:'40% 60%',
    fontSize: '80%', margin: 0, height: '100%'
  });

  const inpNode = addNode(null, 'div', {overflow: 'auto'}, pcssNode.textContent.replace(/^\s*\n+/m,'').replace(/(^|\n)  /g, '$1'));
  const genNode = addNode(null, 'div', {borderLeft:'1px solid #ddd', paddingLeft:'1em', overflow: 'auto'}, generated);

  diff.forEach(line => genNode.innerHTML = genNode.innerHTML.replace(line.replace(/&/g, '&amp;'), m=>`<span style="background-color:#ffbfbf;">${m}</span>`));

  document.body.style.backgroundColor = ok ? '#f4fff4' : '#fff4f4';
});

const genLines = generated.split(/\n/).filter(l=>!!l);
const expLines = expected.split(/\n/).filter(l=>!!l);
while(genLines.length && genLines[0] === expLines[0]) { genLines.shift(); expLines.shift(); }
if(!genLines.length && !expLines.length) {
  ok = true;
  log('OK');
} else {
  log('FAIL!');
  if(genLines.length) {
    log('DIFF at:');
    let toShow = 5;
    let offset = 0;
    for(let i=0; toShow && genLines[i]; i++) {
      if(genLines[i] !== expLines[i+offset]) {
        if(genLines[i] === expLines[i+offset-1]) { offset--; continue; }
        diff.push(genLines[i]);
        log('GEN: ' +  genLines[i]);
        log('EXP: ' + (expLines[i+offset] || ''));
        log('');
        toShow--;
      }
    }
  } else if(expLines.length) {
    log('Expected but NOT GENERATED:');
    log(expLines.join('\n'));
  }
}

if(window !== window.parent) {
  window.parent.postMessage({ok, name: testName}, '*');
}
