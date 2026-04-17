import { registry } from "../core/registry.js";

import { schema as systemVersion } from "./system/version.js";
import { schema as systemBootProgress } from "./system/bootProgress.js";
import { schema as querySql } from "./query/sql.js";
import { schema as notebookLsNotebooks } from "./notebook/lsNotebooks.js";
import { schema as notebookCreateNotebook } from "./notebook/createNotebook.js";
import { schema as filetreeListDocsByPath } from "./filetree/listDocsByPath.js";
import { schema as filetreeCreateDocWithMd } from "./filetree/createDocWithMd.js";
import { schema as filetreeCreateDailyNote } from "./filetree/createDailyNote.js";
import { schema as filetreeRenameDoc } from "./filetree/renameDoc.js";
import { schema as filetreeRemoveDoc } from "./filetree/removeDoc.js";
import { schema as filetreeGetHPathByID } from "./filetree/getHPathByID.js";
import { schema as blockGetBlockKramdown } from "./block/getBlockKramdown.js";
import { schema as blockGetChildBlocks } from "./block/getChildBlocks.js";
import { schema as blockAppendBlock } from "./block/appendBlock.js";
import { schema as blockInsertBlock } from "./block/insertBlock.js";
import { schema as blockUpdateBlock } from "./block/updateBlock.js";
import { schema as blockDeleteBlock } from "./block/deleteBlock.js";
import { schema as attrGetBlockAttrs } from "./attr/getBlockAttrs.js";
import { schema as attrSetBlockAttrs } from "./attr/setBlockAttrs.js";
import { schema as searchFullTextSearchBlock } from "./search/fullTextSearchBlock.js";
import { schema as exportExportMdContent } from "./export/exportMdContent.js";
import { schema as assetUpload } from "./asset/upload.js";
import { schema as notificationPushMsg } from "./notification/pushMsg.js";

const schemas = [
  systemVersion,
  systemBootProgress,
  querySql,
  notebookLsNotebooks,
  notebookCreateNotebook,
  filetreeListDocsByPath,
  filetreeCreateDocWithMd,
  filetreeCreateDailyNote,
  filetreeRenameDoc,
  filetreeRemoveDoc,
  filetreeGetHPathByID,
  blockGetBlockKramdown,
  blockGetChildBlocks,
  blockAppendBlock,
  blockInsertBlock,
  blockUpdateBlock,
  blockDeleteBlock,
  attrGetBlockAttrs,
  attrSetBlockAttrs,
  searchFullTextSearchBlock,
  exportExportMdContent,
  assetUpload,
  notificationPushMsg,
];

for (const schema of schemas) {
  registry.register(schema);
}

export { schemas };
