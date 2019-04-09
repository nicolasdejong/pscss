## Client side partial scss (pscss) to css converter.

This is a piece of javascript that converts a small subset of scss to standard css.
Target use is for simple web pages or web apps that prefer a client side solution
instead of a server build to generate the css.

Load this script in the HEAD section and conversion is automatic. No build required.

#### How to use

  `<link type="text/pscss" href="your-styles.pscss" rel="stylesheet">`<br>
or<br>
  `<style type="text/pscss">.your.inline.ncss {}</style>`

and load this script: `<script src="pscss-1-min.js"></script>` somewhere in head.

**Note:** Using "filename.scss" and type="text/scss" is supported as well for better ide/editor support.


#### Features

- 5KB minimized
- single-line comments
- nested comments (opt-in using the "nc" flag)
- $variables by renaming them to css variables (added bonus here is that they can be altered at runtime)
- nested properties
- @import of (p)scss (just not with file:// protocol because browsers don't allow it)
- @import on any level: '@import "name";' (where name starts with '_' (not part of real name) or ends with '.p?[sn]css')
- @media will always be promoted to top level, so can be defined deeper, as in scss.
- basic scss @mixin with args but without logic or maps. Use @include to use mixin.
- pscss.js script loading can be anywhere in HEAD (so not only at end of head as with ncss)
- flags can be given in the script tag:
  - 'expose' flag attribute that exposes extra converter and function plugins, and pscss to css conversion function
  - 'watch' flag attribute that watches for DOM changes for new pscss LINK or SCRIPT nodes after loading.
  - 'files' attribute to load one or more pscss resources (instead of multiple LINKs)
- runtime support, if 'expose' flag is given, exposes a global 'pscss' variable containing:
  - ```convertToCss(pcssText: string): string```
  - ```converters[]: (pcss: string, quotes:string[], vars:{string:string}, mixins:{string:string}) => string```
  - ```functions{}: string : (pcss: string, args: string[], context:{quotes:string[]}) => string```
  - ```options{}: string : string|boolean (from script attributes)```
  - ```getVar(name: string, elem?: Element): string```
  - ```setVar(name: string, value: string, elem?: Element): void```
   <br><br>
  The converters and functions are initially empty but can be extended.<br>
  Adding converters or functions should be done before styles are loaded (move to beginning of head)

See the [scss reference](https://sass-lang.com/documentation/file.SASS_REFERENCE.html) for more info on how to use the scss features supported here.

See the [tests](test/test.html) for examples of the above scss features.

#### Examples

Add pscss script, expose pscss variable and include more scss:

```<script src="pscss-1.min.js" expose files="a.scss, b.scss, c.scss">```

Using the exposed pscss, do live conversion of a bit of pscss and set/update a variable:

```
<script>
console.log('css:', pscss.convertToCss('.panel { color:red; &.blue { color:blue } }'));
pscss.setVar('panel-color', 'green'); // this will update the DOM wherever this var is used
</script>
```

#### Notes
This is a very simple client side css preprocessor with limited functionality.
The pscss code is kept small by using regex instead of proper tokenization.
This works quite well, but there are some corner cases where conversion fails.
That typically happens with unmatched quotes in remarks. See [test](test/test.html) for example.

If all you want is nesting, take a look at ncss. It is a small piece of javascript which generates
css from nested css only.

For even more client-side css-preprocessing power, see [postcss](https://github.com/postcss/postcss) or [less](http://lesscss.org/).
They are a lot bigger, but have many more conversions.
