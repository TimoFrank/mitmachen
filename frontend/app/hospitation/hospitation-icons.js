/*
 * Font Awesome Free 5.15.4 by @fontawesome, https://fontawesome.com
 * Icons: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
 * Versioned license: https://github.com/FortAwesome/Font-Awesome/blob/5.15.4/LICENSE.txt
 *
 * Original solid glyph outlines from the retained Font Awesome TrueType source
 * were converted to SVG quadratic paths. The outlines have not been redrawn.
 * Coordinates use the original advance width and 512 font units per em.
 */
(function () {
  "use strict";

  const icons = Object.freeze({
    observations: Object.freeze({
      name: "eye",
      codepoint: "F06E",
      viewBox: "0 0 576 512",
      path: "M573 241Q576 248 576 256Q576 264 573 271Q531 351 455 399.5Q379 448 288 448Q197 448 121 399.5Q45 351 3 271Q0 264 0 256Q0 248 3 241Q45 161 121 112.5Q197 64 288 64Q379 64 455 112.5Q531 161 573 241ZM288 400Q348 400 390 358Q432 316 432 256Q432 196 390 154Q348 112 288 112Q228 112 186 154Q144 196 144 256Q144 316 186 358Q228 400 288 400ZM288 160Q328 160 356 188Q384 216 384 255.5Q384 295 356 323.5Q328 352 288.5 352Q249 352 220.5 323.5Q192 295 192 256Q192 243 196 231Q208 240 224 240Q244 240 258 226Q272 212 272 192Q272 176 263 164Q275 160 288 160Z"
    }),
    pattern: Object.freeze({
      name: "layer-group",
      codepoint: "F5FD",
      viewBox: "0 0 512 512",
      path: "M12 148Q0 142 0 128Q0 114 12 108L245 2Q250 0 256 0Q262 0 267 2L500 108Q512 114 512 128Q512 142 500 148L267 254Q256 259 245 254L12 148ZM500 236Q512 242 512 256.5Q512 271 500 276L267 382Q256 387 245 382L12 276Q0 271 0 256.5Q0 242 12 236L71 210L232 283Q244 288 256 288Q268 288 280 283L442 210L500 236ZM500 364Q512 370 512 384Q512 398 500 404L267 510Q256 515 245 510L12 404Q0 398 0 384Q0 370 12 364L70 338L232 411Q244 416 256 416Q268 416 280 411L442 338L500 364Z"
    }),
    hypothesis: Object.freeze({
      name: "lightbulb",
      codepoint: "F0EB",
      viewBox: "0 0 352 512",
      path: "M96 454L96 416L256 416L256 454Q256 464 251 472L234 498Q224 512 207 512L145 512Q128 512 119 498L101 472Q96 464 96 454ZM0 176Q0 105 50 52.5Q100 0 175 0Q249 0 300.5 51.5Q352 103 352 176Q352 242 308 292Q271 335 256 383Q256 383 256 384L96 384Q96 383 96 383Q81 335 44 292Q0 242 0 176ZM176 96Q183 96 187.5 91.5Q192 87 192 80Q192 73 187.5 68.5Q183 64 176 64Q130 64 97 97Q64 130 64 176Q64 183 68.5 187.5Q73 192 80 192Q87 192 91.5 187.5Q96 183 96 176Q96 143 119.5 119.5Q143 96 176 96Z"
    }),
    nextStep: Object.freeze({
      name: "arrow-right",
      codepoint: "F061",
      viewBox: "0 0 448 512",
      path: "M190 67L213 45Q220 38 230 38Q240 38 247 45L441 239Q448 246 448 256Q448 266 441 273L247 467Q240 474 230 474Q220 474 213 467L190 445Q183 438 183.5 428Q184 418 191 411L311 296L24 296Q14 296 7 289Q0 282 0 272L0 240Q0 230 7 223Q14 216 24 216L311 216L191 101Q184 94 183.5 84Q183 74 190 67Z"
    })
  });

  function svg(key) {
    if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(icons, key)) return "";
    const icon = icons[key];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="1em" height="1em" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><path d="${icon.path}"/></svg>`;
  }

  const source = Object.freeze({
    provider: "Font Awesome",
    family: "Font Awesome 5 Free Solid",
    version: "5.15.4",
    geometry: "Original TrueType glyph contours converted to SVG paths",
    originalFontSha256: "af6397503fcefbd613976c21ad5c1e37298c18bbe07d096db03ccd3af6e05ba8",
    attribution: "Font Awesome Free 5.15.4 by @fontawesome, https://fontawesome.com",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    upstreamLicenseUrl: "https://github.com/FortAwesome/Font-Awesome/blob/5.15.4/LICENSE.txt"
  });

  window.HospitationFrameworkIcons = Object.freeze({ svg, source });
})();
