export function getWebGLPatch(vendor: string, renderer: string): string {
  return `
    // Patches UNMASKED_VENDOR_WEBGL (0x9245) and UNMASKED_RENDERER_WEBGL (0x9246)
    const getParameterProxy = new Proxy(WebGLRenderingContext.prototype.getParameter, {
      apply(target, thisArg, args) {
        const param = args[0];
        if (param === 0x9245) return '${vendor.replace(/'/g, "\\'")}';
        if (param === 0x9246) return '${renderer.replace(/'/g, "\\'")}';
        return Reflect.apply(target, thisArg, args);
      },
    });
    WebGLRenderingContext.prototype.getParameter = getParameterProxy;
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParameter2Proxy = new Proxy(WebGL2RenderingContext.prototype.getParameter, {
        apply(target, thisArg, args) {
          const param = args[0];
          if (param === 0x9245) return '${vendor.replace(/'/g, "\\'")}';
          if (param === 0x9246) return '${renderer.replace(/'/g, "\\'")}';
          return Reflect.apply(target, thisArg, args);
        },
      });
      WebGL2RenderingContext.prototype.getParameter = getParameter2Proxy;
    }
  `;
}

export function getCanvasPatch(seed: number): string {
  return `
    const canvasSeed = ${seed};
    function mulberry32(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const canvasRng = mulberry32(canvasSeed);
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const imageData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + Math.floor(canvasRng() * 3) - 1));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + Math.floor(canvasRng() * 3) - 1));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + Math.floor(canvasRng() * 3) - 1));
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (e) {}
      }
      return originalToDataURL.call(this, type, quality);
    };
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      this.toDataURL(type, quality);
      return originalToBlob.call(this, callback, type, quality);
    };
  `;
}

export function getAudioContextPatch(seed: number): string {
  return `
    const audioSeed = ${seed};
    function audioRng(s) {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    if (typeof AnalyserNode !== 'undefined') {
      const originalGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        originalGetFloat.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (audioRng(audioSeed + i) - 0.5) * 0.1;
        }
      };
    }
    if (typeof AudioBuffer !== 'undefined') {
      const originalGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function(channel) {
        const data = originalGetChannelData.call(this, channel);
        for (let i = 0; i < Math.min(data.length, 128); i++) {
          data[i] += (audioRng(audioSeed + channel * 1000 + i) - 0.5) * 0.0001;
        }
        return data;
      };
    }
  `;
}

export function getFontPatch(): string {
  return `
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const fontList = [
      'Arial', 'Verdana', 'Helvetica', 'Tahoma', 'Trebuchet MS',
      'Times New Roman', 'Georgia', 'Garamond', 'Courier New', 'Monaco',
    ];
    if (document.fonts && document.fonts.check) {
      const originalCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(font, text) {
        const fontFamily = font.replace(/['"]/g, '').split(',')[0].trim();
        const isAllowed = baseFonts.includes(fontFamily.toLowerCase()) ||
                          fontList.some(f => f.toLowerCase() === fontFamily.toLowerCase());
        if (!isAllowed) return false;
        return originalCheck(font, text);
      };
    }
  `;
}
