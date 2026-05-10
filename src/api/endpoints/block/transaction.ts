export interface BlockOperation {
    action: string;
    id?: string;
    data?: unknown;
    parentID?: string;
    previousID?: string;
    nextID?: string;
    rootID?: string;
    [key: string]: unknown;
}

export interface BlockTransaction {
    timestamp: number;
    doOperations: BlockOperation[];
    undoOperations: BlockOperation[] | null;
}

export interface BlockTransactionResponse {
    code: number;
    msg: string;
    data: BlockTransaction[];
}
