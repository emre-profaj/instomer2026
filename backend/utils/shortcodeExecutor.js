import { executeToolRequest } from './toolExecutor.js';
import prisma from '../lib/prisma.js';

/**
 * Parses text for shortcodes like [tool_name param1="value1" param2="value2"]
 * and executes the corresponding workspace tools.
 * Returns the text with the shortcodes replaced by the tool results.
 */
export const processShortcodes = async (text, workspaceId) => {
    if (!text || typeof text !== 'string') return text;

    // Pattern to match [tool_name key="value" key2="value2"]
    const shortcodeRegex = /\[([a-zA-Z0-9_]+)(.*?)\]/g;
    
    let match;
    const matches = [];
    
    // Find all matches first
    while ((match = shortcodeRegex.exec(text)) !== null) {
        matches.push({
            fullMatch: match[0],
            toolName: match[1],
            paramsString: match[2].trim(),
            index: match.index
        });
    }

    if (matches.length === 0) return text;

    // Fetch workspace tools
    const tools = await prisma.aIBotTool.findMany({
        where: { workspaceId, isActive: true },
        include: { apiIntegration: true }
    });

    let resultText = text;

    for (const m of matches) {
        const tool = tools.find(t => t.name === m.toolName);
        if (!tool) continue; // Not a valid tool, ignore and leave shortcode as text

        // Parse parameters
        const args = {};
        if (m.paramsString) {
            // Match key="value" or key='value'
            const paramRegex = /([a-zA-Z0-9_]+)=["'](.*?)["']/g;
            let paramMatch;
            while ((paramMatch = paramRegex.exec(m.paramsString)) !== null) {
                args[paramMatch[1]] = paramMatch[2];
            }
        }

        try {
            console.log(`🚀 [Shortcode] Executing tool: ${tool.name} with args:`, args);
            const toolResult = await executeToolRequest(tool, args);
            
            // Format result nicely
            let resultString = '';
            if (typeof toolResult === 'object') {
                // If the object has a "message" or "result" field, prioritize it for cleaner output
                if (toolResult.message && Object.keys(toolResult).length === 1) {
                    resultString = toolResult.message;
                } else if (toolResult.result && Object.keys(toolResult).length === 1) {
                    resultString = toolResult.result;
                } else {
                    resultString = JSON.stringify(toolResult, null, 2);
                }
            } else {
                resultString = String(toolResult);
            }

            // Replace the shortcode with the result
            resultText = resultText.replace(m.fullMatch, `\n🤖 *${tool.name} Sonucu:*\n${resultString}\n`);
        } catch (error) {
            console.error(`❌ [Shortcode] Execution error for ${tool.name}:`, error);
            resultText = resultText.replace(m.fullMatch, `[Hata: ${tool.name} çalıştırılamadı - ${error.message}]`);
        }
    }

    return resultText;
};
