import { c as createComponent } from './astro-component_C3ia9to4.mjs';
import 'piccolore';
import { r as renderTemplate, p as renderSlot, q as renderHead, h as addAttribute } from './entrypoint_BMl4Zic0.mjs';
import 'clsx';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Base;
  const { title, description, canonical } = Astro2.props;
  const url = canonical ?? Astro2.url.href;
  return renderTemplate(_a || (_a = __template(['<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>', '</title><meta name="description"', '><link rel="canonical"', '><link rel="icon" type="image/svg+xml" href="/favicon.svg"><!-- AdSense placeholder --><!-- <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"><\/script> -->', '</head> <body class="bg-white text-gray-900 font-sans"> <header class="bg-indigo-700 text-white"> <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between"> <a href="/" class="text-xl font-bold tracking-tight hover:opacity-90">catchment.school</a> <nav class="text-sm flex gap-4 opacity-90"> <a href="/council" class="hover:underline">By Council</a> <a href="/area" class="hover:underline">By Town</a> </nav> </div> </header> <main class="max-w-5xl mx-auto px-4 py-8"> ', ' </main> <footer class="border-t mt-16"> <div class="max-w-5xl mx-auto px-4 py-8 text-sm text-gray-500 flex flex-wrap gap-4 justify-between"> <p>© ', ' catchment.school — School data from <a href="https://get-information-about-schools.service.gov.uk" class="underline" rel="nofollow">GIAS</a></p> <nav class="flex gap-4"> <a href="/about" class="hover:underline">About</a> <a href="/privacy" class="hover:underline">Privacy</a> </nav> </div> </footer> </body></html>'])), title, addAttribute(description, "content"), addAttribute(url, "href"), renderHead(), renderSlot($$result, $$slots["default"]), (/* @__PURE__ */ new Date()).getFullYear());
}, "C:/Users/sunny/Desktop/catchment-school/src/layouts/Base.astro", void 0);

export { $$Base as $ };
