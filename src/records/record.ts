import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

export type COMPARE_OPERATOR_TYPE = 'Equals' | 'NotEquals' | 'GreaterThan' | 'GreaterThanOrEquals' | 'LessThan' | 'LessThanOrEquals';

export type FUNCTION_OPERATOR_TYPE = "Contains" | "BeginsWith" | "Exists" | "NotExists";

export type PRIMARY_ATTRIBUTE_TYPE = "Partition" | "Range";
export interface DynamoDBPrimaryAttribute {
    get name(): string;
    get value(): any;
    get valueType(): DYNAMODB_ATTRIBUTE_TYPE;
    get attributeType(): PRIMARY_ATTRIBUTE_TYPE;
    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
}

export interface DynamoDBRecordIndex {
    getRecordTypeId(): symbol;

    getIndexName(): string | undefined;
    isConsistentRead(): boolean;
    getTableName(): string;
    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryAttribute>;
}

export type Ctor<TRecord extends DynamoDBRecord> = new (...args: any[]) => TRecord;
export abstract class DynamoDBRecordIndexBase<TRecord extends DynamoDBRecord> implements DynamoDBRecordIndex {
    getIndexName(): string | undefined {
        return undefined;
    }

    abstract getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryAttribute>;
    abstract getRecordTypeId(): symbol;
    abstract isConsistentRead(): boolean;
    abstract getTableName(): string;

    protected abstract getRecordType(): Ctor<TRecord>;
}

export abstract class DynamoDBRecord {
    abstract getRecordId(): DynamoDBRecordIndex;
}

export abstract class DynamoDBRecordBase<TRecordId extends DynamoDBRecordIndex> implements DynamoDBRecord {
    getRecordId(): DynamoDBRecordIndex {
        return this.doGetRecordId();
    }

    protected abstract doGetRecordId(): TRecordId;
}

export type DynamoDBQueryResult<TRecord extends DynamoDBRecord> = {
    lastKey: DynamoDBRecordIndexBase<TRecord> | null;
    total: number;
    records: ReadonlyArray<TRecord>;
}
