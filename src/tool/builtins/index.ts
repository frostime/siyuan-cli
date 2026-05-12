import { toolRegistry } from '../registry.js';
import { tool as listDocTree } from './list-doc-tree.js';
import { tool as listDailynote } from './list-dailynote.js';
import { tool as getBlockInfo } from './get-block-info.js';
import { tool as getBlockContent } from './get-block-content.js';
import { tool as bruteEdit } from './brute-edit.js';
import { tool as pushMd } from './push-md.js';
import { tool as locateBlock } from './locate-block.js';

const tools = [
    listDocTree,
    listDailynote,
    getBlockInfo,
    getBlockContent,
    bruteEdit,
    pushMd,
    locateBlock
];
for (const tool of tools) {
    toolRegistry.register(tool);
}

export { tools };
