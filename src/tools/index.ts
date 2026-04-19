import { toolRegistry } from '../core/tools.js';
import { tool as listDocTree } from './list-doc-tree.js';
import { tool as listDailynote } from './list-dailynote.js';
import { tool as appendContent } from './append-content.js';
import { tool as resolvePath } from './resolve-path.js';

const tools = [listDocTree, listDailynote, appendContent, resolvePath];
for (const tool of tools) {
    toolRegistry.register(tool);
}

export { tools };
