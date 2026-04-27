import { toolRegistry } from '../registry.js';
import { tool as listDocTree } from './list-doc-tree.js';
import { tool as listDailynote } from './list-dailynote.js';
import { tool as appendContent } from './append-content.js';
import { tool as resolvePath } from './resolve-path.js';
import { tool as getBlockInfo } from './get-block-info.js';
import { tool as getBlockContent } from './get-block-content.js';

const tools = [listDocTree, listDailynote, appendContent, resolvePath, getBlockInfo, getBlockContent];
for (const tool of tools) {
    toolRegistry.register(tool);
}

export { tools };
