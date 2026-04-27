export function maskSensitiveInfo(text) {
    if (!text) return text;
    // Mask TC: 11 digits starting with 1-9
    text = text.replace(/\b([1-9]\d{2})\d{5}(\d{3})\b/g, '$1*****$2');
    // Mask DOB: DD.MM.YYYY or DD/MM/YYYY
    text = text.replace(/\b\d{2}[\.\/\-]\d{2}[\.\/\-]\d{4}\b/g, '**/**/****');
    return text;
}
