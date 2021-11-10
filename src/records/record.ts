export type COMPARE_OPERATOR_TYPE = 'Equals' | 'NotEquals' | 'GreaterThan' | 'GreaterThanOrEquals' | 'LessThan' | 'LessThanOrEquals';

export type FUNCTION_OPERATOR_TYPE = "Contains" | "BeginsWith" | "EndsWith" | "Exists" | "NotExists";

export interface DynamoDBPrimaryKey {
    attributeName: string;
    attributeValue: string;
    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
}

export interface DynamoDBQueryIndex {
    indexName(): string | undefined;
    isConsistentRead(): boolean;
    tableName(): string;
    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKey>;
}

export type Ctor<TRecord extends DynamoDBRecord> = new (...args: any[]) => TRecord;
export abstract class DynamoDBQueryIndexBase<TRecord extends DynamoDBRecord> implements DynamoDBQueryIndex {
    abstract getRecordTypeId(): symbol;
    abstract getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKey>;

    indexName(): string | undefined {
        return undefined;
    }

    abstract isConsistentRead(): boolean;
    abstract tableName(): string;

    protected abstract getRecordType(): Ctor<TRecord>;
}

export interface DynamoDBRecord {
    getRecordId(): DynamoDBQueryIndex;
}

export abstract class DynamoDBRecordBase<TRecordId extends DynamoDBQueryIndex> implements DynamoDBRecord {
    getRecordId(): DynamoDBQueryIndex {
        return this.doGetRecordId();
    }

    protected abstract doGetRecordId(): TRecordId;
}

export type DynamoDBQueryResult<TRecord extends DynamoDBRecord> = {
    lastKey: DynamoDBQueryIndexBase<TRecord> | null;
    total: number;
    records: ReadonlyArray<TRecord>;
}
