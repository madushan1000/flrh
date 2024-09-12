## Foreign Language Reading Helper
FLRH(Foreign Language Reading Helper) is a web reader you can load via a bookmarklet to websites like forums/newspapers, in a language you want to learn.

## How to use?
Drag and drop the link below to your bookmark toolbar, you can also just copy the link and create the bookmarklet manually. 

[<img src="icon-192.png" alt="FLRH">](javascript:%28function%28%29{window.FLRHrootURL='https://madushan.caas.lk/flrh';document.getElementsByTagName%28'body'%29[0].appendChild%28document.createElement%28'script'%29%29.setAttribute%28'src',window.FLRHrootURL+'/bookmarklet.js'%29}%29%28%29;)

Then, when you're on a website you want to run the web reader, just click on the bookmark. And once the overlay is loaded, select the language you want to translate to/from and then click on the words you want to translate. You can also select the words you want to translate and FLRH will batch translate them. Translations are not perfect, but usually good enough to start learning. Note that FLRH is not intended as a full page translator. For that use a web extension like TWP.


## How does it work?
All the translations happen locally on your browser. FLRH uses [bergamot-translator](https://github.com/browsermt/bergamot-translator) WASM build, and machine learning models trained by mozilla [firefox-translations-models](https://github.com/mozilla/firefox-translations-models/). When you trigger the bookmarklet, it'll download and usually cache all the files needed for translations locally(~5Mb for the translator + ~20Mb for each language you want to use).

## It doesn't work for me. What do I do?
Generally, it should work for most websites, even on smartphones. But some websites restrict what content can be loaded into them(by using strict `Content-Security-Policy` headers). Please do not disable Content Security Policy in your browser to make it work. Use a webextensions like [CSP for ME](https://addons.mozilla.org/en-US/firefox/addon/csp-for-me/) to inject your own policies to specific websites. Bellow will work for FLRH if you use `CSP for ME`.

```
default-src https://madushan.caas.lk/flrh/; script-src-elem https://madushan.caas.lk/flrh/ https://cdn.jsdelivr.net/gh/madushan1000/; style-src https://madushan.caas.lk/flrh/ https://fonts.googleapis.com/; connect-src https://madushan.caas.lk/flrh/ https://cdn.jsdelivr.net/gh/madushan1000/; font-src https://fonts.gstatic.com/; worker-src data:; script-src 'wasm-unsafe-eval';
```
