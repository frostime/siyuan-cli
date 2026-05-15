import { registry } from '../registry.js';
import type { EndpointSchema } from '@/shared/schema.js';

// System APIs
import { schema as systemVersion } from './system/version.js';
import { schema as systemBootProgress } from './system/bootProgress.js';
import { schema as systemCurrentTime } from './system/currentTime.js';
import { schema as systemGetConf } from './system/getConf.js';
import { schema as systemExit } from './system/exit.js';
import { schema as systemLogoutAuth } from './system/logoutAuth.js';

// Query APIs
import { schema as querySql } from './query/sql.js';

// Notebook APIs
import { schema as notebookLsNotebooks } from './notebook/lsNotebooks.js';
import { schema as notebookCreateNotebook } from './notebook/createNotebook.js';
import { schema as notebookOpenNotebook } from './notebook/openNotebook.js';
import { schema as notebookCloseNotebook } from './notebook/closeNotebook.js';
import { schema as notebookRenameNotebook } from './notebook/renameNotebook.js';
import { schema as notebookRemoveNotebook } from './notebook/removeNotebook.js';
import { schema as notebookGetNotebookConf } from './notebook/getNotebookConf.js';
import { schema as notebookSetNotebookConf } from './notebook/setNotebookConf.js';

// Filetree APIs
import { schema as filetreeListDocsByPath } from './filetree/listDocsByPath.js';
import { schema as filetreeCreateDocWithMd } from './filetree/createDocWithMd.js';
import { schema as filetreeCreateDailyNote } from './filetree/createDailyNote.js';
import { schema as filetreeRenameDoc } from './filetree/renameDoc.js';
import { schema as filetreeRenameDocByID } from './filetree/renameDocByID.js';
import { schema as filetreeRemoveDoc } from './filetree/removeDoc.js';
import { schema as filetreeRemoveDocByID } from './filetree/removeDocByID.js';
import { schema as filetreeMoveDocs } from './filetree/moveDocs.js';
import { schema as filetreeMoveDocsByID } from './filetree/moveDocsByID.js';
import { schema as filetreeGetHPathByID } from './filetree/getHPathByID.js';
import { schema as filetreeGetHPathByPath } from './filetree/getHPathByPath.js';
import { schema as filetreeGetIDsByHPath } from './filetree/getIDsByHPath.js';
import { schema as filetreeGetPathByID } from './filetree/getPathByID.js';
import { schema as filetreeGetFullHPathByID } from './filetree/getFullHPathByID.js';
import { schema as filetreeDuplicateDoc } from './filetree/duplicateDoc.js';
import { schema as filetreeSearchDocs } from './filetree/searchDocs.js';

// Block APIs
import { schema as blockGetBlockKramdown } from './block/getBlockKramdown.js';
import { schema as blockGetBlockKramdowns } from './block/getBlockKramdowns.js';
import { schema as blockGetChildBlocks } from './block/getChildBlocks.js';
import { schema as blockGetDocInfo } from './block/getDocInfo.js';
import { schema as blockGetDocsInfo } from './block/getDocsInfo.js';
import { schema as blockGetTailChildBlocks } from './block/getTailChildBlocks.js';
import { schema as blockGetBlockSiblingID } from './block/getBlockSiblingID.js';
import { schema as blockGetBlockBreadcrumb } from './block/getBlockBreadcrumb.js';
import { schema as blockGetBlockDOM } from './block/getBlockDOM.js';
import { schema as blockGetBlockInfo } from './block/getBlockInfo.js';
import { schema as blockAppendBlock } from './block/appendBlock.js';
import { schema as blockPrependBlock } from './block/prependBlock.js';
import { schema as blockInsertBlock } from './block/insertBlock.js';
import { schema as blockUpdateBlock } from './block/updateBlock.js';
import { schema as blockBatchUpdateBlock } from './block/batchUpdateBlock.js';
import { schema as blockBatchInsertBlock } from './block/batchInsertBlock.js';
import { schema as blockBatchAppendBlock } from './block/batchAppendBlock.js';
import { schema as blockBatchPrependBlock } from './block/batchPrependBlock.js';
import { schema as blockDeleteBlock } from './block/deleteBlock.js';
import { schema as blockMoveBlock } from './block/moveBlock.js';
import { schema as blockFoldBlock } from './block/foldBlock.js';
import { schema as blockUnfoldBlock } from './block/unfoldBlock.js';
import { schema as blockTransferBlockRef } from './block/transferBlockRef.js';
import { schema as blockAppendDailyNoteBlock } from './block/appendDailyNoteBlock.js';
import { schema as blockPrependDailyNoteBlock } from './block/prependDailyNoteBlock.js';

// Outline APIs
import { schema as outlineGetDocOutline } from './outline/getDocOutline.js';

// Attr APIs
import { schema as attrGetBlockAttrs } from './attr/getBlockAttrs.js';
import { schema as attrSetBlockAttrs } from './attr/setBlockAttrs.js';
import { schema as attrBatchGetBlockAttrs } from './attr/batchGetBlockAttrs.js';
import { schema as attrBatchSetBlockAttrs } from './attr/batchSetBlockAttrs.js';

// Search APIs
import { schema as searchFullTextSearchBlock } from './search/fullTextSearchBlock.js';

// Export APIs
import { schema as exportExportMdContent } from './export/exportMdContent.js';
import { schema as exportExportResources } from './export/exportResources.js';

// Asset APIs
import { schema as assetUpload } from './asset/upload.js';

// Notification APIs
import { schema as notificationPushMsg } from './notification/pushMsg.js';
import { schema as notificationPushErrMsg } from './notification/pushErrMsg.js';

// Template APIs
import { schema as templateRender } from './template/render.js';
import { schema as templateRenderSprig } from './template/renderSprig.js';

// File APIs
import { schema as fileGetFile } from './file/getFile.js';
import { schema as filePutFile } from './file/putFile.js';
import { schema as fileRemoveFile } from './file/removeFile.js';
import { schema as fileRenameFile } from './file/renameFile.js';
import { schema as fileReadDir } from './file/readDir.js';

// Import APIs
import { schema as importImportStdMd } from './import/importStdMd.js';

// Convert APIs
import { schema as convertPandoc } from './convert/pandoc.js';

// SQLite APIs
import { schema as sqliteFlushTransaction } from './sqlite/flushTransaction.js';

// Network APIs
import { schema as networkForwardProxy } from './network/forwardProxy.js';

const schemas: EndpointSchema<any>[] = [
    // System
    systemVersion,
    systemBootProgress,
    systemCurrentTime,
    systemGetConf,
    systemExit,
    systemLogoutAuth,
    // Query
    querySql,
    // Notebook
    notebookLsNotebooks,
    notebookCreateNotebook,
    notebookOpenNotebook,
    notebookCloseNotebook,
    notebookRenameNotebook,
    notebookRemoveNotebook,
    notebookGetNotebookConf,
    notebookSetNotebookConf,
    // Filetree
    filetreeListDocsByPath,
    filetreeCreateDocWithMd,
    filetreeCreateDailyNote,
    filetreeRenameDoc,
    filetreeRenameDocByID,
    filetreeRemoveDoc,
    filetreeRemoveDocByID,
    filetreeMoveDocs,
    filetreeMoveDocsByID,
    filetreeGetHPathByID,
    filetreeGetHPathByPath,
    filetreeGetIDsByHPath,
    filetreeGetPathByID,
    filetreeGetFullHPathByID,
    filetreeDuplicateDoc,
    filetreeSearchDocs,
    // Block
    blockGetBlockKramdown,
    blockGetBlockKramdowns,
    blockGetChildBlocks,
    blockGetDocInfo,
    blockGetDocsInfo,
    blockGetTailChildBlocks,
    blockGetBlockSiblingID,
    blockGetBlockBreadcrumb,
    blockGetBlockDOM,
    blockGetBlockInfo,
    blockAppendBlock,
    blockPrependBlock,
    blockInsertBlock,
    blockUpdateBlock,
    blockBatchUpdateBlock,
    blockBatchInsertBlock,
    blockBatchAppendBlock,
    blockBatchPrependBlock,
    blockDeleteBlock,
    blockMoveBlock,
    blockFoldBlock,
    blockUnfoldBlock,
    blockTransferBlockRef,
    blockAppendDailyNoteBlock,
    blockPrependDailyNoteBlock,
    // Outline
    outlineGetDocOutline,
    // Attr
    attrGetBlockAttrs,
    attrSetBlockAttrs,
    attrBatchGetBlockAttrs,
    attrBatchSetBlockAttrs,
    // Search
    searchFullTextSearchBlock,
    // Export
    exportExportMdContent,
    exportExportResources,
    // Asset
    assetUpload,
    // Notification
    notificationPushMsg,
    notificationPushErrMsg,
    // Template
    templateRender,
    templateRenderSprig,
    // File
    fileGetFile,
    filePutFile,
    fileRemoveFile,
    fileRenameFile,
    fileReadDir,
    // Convert
    // Convert
    convertPandoc,
    // SQLite
    sqliteFlushTransaction,
    // Import
    importImportStdMd,
    // Network
    networkForwardProxy
];

for (const schema of schemas) {
    registry.register(schema);
}

export { schemas };
