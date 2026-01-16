// Node.js 25+ compatibility fix for pdf-parse
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix { };
}
if (typeof global.document === 'undefined') {
    global.document = {
        createElement: () => ({
            getContext: () => ({})
        })
    };
}
