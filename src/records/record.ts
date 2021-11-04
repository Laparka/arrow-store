export type COMPARE_OPERATOR_TYPE = 'Equals' | 'NotEquals' | 'GreaterThan' | 'GreaterThanOrEquals' | 'LessThan' | 'LessThanOrEquals';

export interface RecordIdAttribute {
    attributeName: string;
    attributeValue: string;
    get operator(): COMPARE_OPERATOR_TYPE;
}

export interface RecordQuery {
    getPrimaryKeys(): ReadonlyArray<RecordIdAttribute>;
}

export abstract class RecordQueryBase<TRecord extends Record> implements RecordQuery {
    abstract getRecordType(): RecordType<TRecord>;
    abstract getPrimaryKeys(): ReadonlyArray<RecordIdAttribute>;
}

export interface Record {
    getRecordId(): RecordQuery;
}

export abstract class RecordBase<TRecordId extends RecordQuery> implements Record {
    getRecordId(): RecordQuery {
        return this.doGetRecordId();
    }

    protected abstract doGetRecordId(): TRecordId;
}

export type RecordType<TRecord extends Record> = new (...args: any[]) => TRecord;

export type QueryResult<TRecord extends Record> = {
    lastKey: RecordQueryBase<TRecord> | null;
    total: number;
    records: ReadonlyArray<TRecord>;
}
