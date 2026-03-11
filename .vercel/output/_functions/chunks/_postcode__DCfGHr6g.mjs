import { c as createComponent } from './astro-component_C3ia9to4.mjs';
import 'piccolore';
import { r as renderTemplate, l as defineScriptVars, n as renderComponent, m as maybeRenderHead } from './entrypoint_BMl4Zic0.mjs';
import { $ as $$Base } from './Base_DREc78d2.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const prerender = false;
async function getStaticPaths() {
  return [];
}
const $$postcode = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$postcode;
  const postcode = Astro2.params.postcode?.toUpperCase().replace(/-/, " ") ?? "";
  return renderTemplate(_a || (_a = __template(["", " <script>(function(){", "\n  async function findNearbySchools() {\n    const subtitle = document.getElementById('subtitle');\n    const results = document.getElementById('results');\n    const errorEl = document.getElementById('error');\n\n    try {\n      // Get lat/lng from postcodes.io\n      const pcRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);\n      if (!pcRes.ok) throw new Error('Invalid postcode');\n      const pcData = await pcRes.json();\n      const { latitude, longitude, admin_district } = pcData.result;\n\n      // Load schools data (pre-built JSON)\n      const schoolsRes = await fetch('/data/schools-geo.json');\n      const schools = await schoolsRes.json();\n\n      // Calculate distance using Haversine\n      function haversine(lat1, lon1, lat2, lon2) {\n        const R = 6371;\n        const dLat = (lat2 - lat1) * Math.PI / 180;\n        const dLon = (lon2 - lon1) * Math.PI / 180;\n        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;\n        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n      }\n\n      const nearby = schools\n        .map(s => ({ ...s, distance: haversine(latitude, longitude, s.lat, s.lng) }))\n        .filter(s => s.distance <= 5) // 5km radius\n        .sort((a, b) => a.distance - b.distance)\n        .slice(0, 20);\n\n      subtitle.textContent = `${nearby.length} schools within 5km of ${postcode}`;\n\n      if (nearby.length === 0) {\n        errorEl.classList.remove('hidden');\n        subtitle.textContent = '';\n        return;\n      }\n\n      results.innerHTML = nearby.map(s => `\n        <a href=\"/school/${s.slug}\" class=\"block border rounded-lg p-4 hover:border-indigo-400 hover:shadow-sm transition-all\">\n          <h3 class=\"font-semibold text-indigo-700 hover:underline\">${s.name}</h3>\n          <p class=\"text-sm text-gray-600 mt-1\">${s.phase} · ${s.type}</p>\n          <p class=\"text-sm text-gray-500 mt-1\">${s.town} · ${s.postcode}</p>\n          <p class=\"text-xs text-gray-400 mt-2\">${s.distance.toFixed(1)} km away</p>\n        </a>\n      `).join('');\n    } catch (e) {\n      errorEl.classList.remove('hidden');\n      subtitle.textContent = '';\n    }\n  }\n\n  findNearbySchools();\n})();<\/script>"], ["", " <script>(function(){", "\n  async function findNearbySchools() {\n    const subtitle = document.getElementById('subtitle');\n    const results = document.getElementById('results');\n    const errorEl = document.getElementById('error');\n\n    try {\n      // Get lat/lng from postcodes.io\n      const pcRes = await fetch(\\`https://api.postcodes.io/postcodes/\\${encodeURIComponent(postcode)}\\`);\n      if (!pcRes.ok) throw new Error('Invalid postcode');\n      const pcData = await pcRes.json();\n      const { latitude, longitude, admin_district } = pcData.result;\n\n      // Load schools data (pre-built JSON)\n      const schoolsRes = await fetch('/data/schools-geo.json');\n      const schools = await schoolsRes.json();\n\n      // Calculate distance using Haversine\n      function haversine(lat1, lon1, lat2, lon2) {\n        const R = 6371;\n        const dLat = (lat2 - lat1) * Math.PI / 180;\n        const dLon = (lon2 - lon1) * Math.PI / 180;\n        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;\n        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n      }\n\n      const nearby = schools\n        .map(s => ({ ...s, distance: haversine(latitude, longitude, s.lat, s.lng) }))\n        .filter(s => s.distance <= 5) // 5km radius\n        .sort((a, b) => a.distance - b.distance)\n        .slice(0, 20);\n\n      subtitle.textContent = \\`\\${nearby.length} schools within 5km of \\${postcode}\\`;\n\n      if (nearby.length === 0) {\n        errorEl.classList.remove('hidden');\n        subtitle.textContent = '';\n        return;\n      }\n\n      results.innerHTML = nearby.map(s => \\`\n        <a href=\"/school/\\${s.slug}\" class=\"block border rounded-lg p-4 hover:border-indigo-400 hover:shadow-sm transition-all\">\n          <h3 class=\"font-semibold text-indigo-700 hover:underline\">\\${s.name}</h3>\n          <p class=\"text-sm text-gray-600 mt-1\">\\${s.phase} · \\${s.type}</p>\n          <p class=\"text-sm text-gray-500 mt-1\">\\${s.town} · \\${s.postcode}</p>\n          <p class=\"text-xs text-gray-400 mt-2\">\\${s.distance.toFixed(1)} km away</p>\n        </a>\n      \\`).join('');\n    } catch (e) {\n      errorEl.classList.remove('hidden');\n      subtitle.textContent = '';\n    }\n  }\n\n  findNearbySchools();\n})();<\/script>"])), renderComponent($$result, "Base", $$Base, { "title": `Schools near ${postcode} | catchment.school`, "description": `Find primary and secondary schools near ${postcode}. View catchment area information and admissions guidance.` }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="text-sm text-gray-500 mb-6 flex gap-2"> <a href="/" class="hover:underline">Home</a> <span>›</span> <span>Schools near ${postcode}</span> </nav> <h1 class="text-3xl font-bold mb-2">Schools near ${postcode}</h1> <p class="text-gray-600 mb-8" id="subtitle">Finding schools…</p> <div id="results" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div> <div id="error" class="hidden text-red-600 bg-red-50 border border-red-200 rounded-lg p-5"> <p>Could not find schools for this postcode. <a href="/" class="underline">Try another search.</a></p> </div> ` }), defineScriptVars({ postcode }));
}, "C:/Users/sunny/Desktop/catchment-school/src/pages/postcode/[postcode].astro", void 0);

const $$file = "C:/Users/sunny/Desktop/catchment-school/src/pages/postcode/[postcode].astro";
const $$url = "/postcode/[postcode]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$postcode,
  file: $$file,
  getStaticPaths,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
