import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

export type COMPARE_OPERATOR_TYPE =
    'Equals'
    | 'NotEquals'
    | 'GreaterThan'
    | 'GreaterThanOrEquals'
    | 'LessThan'
    | 'LessThanOrEquals';

export type FUNCTION_OPERATOR_TYPE = "Contains" | "BeginsWith" | "Exists" | "NotExists";

export type PRIMARY_ATTRIBUTE_TYPE = "Partition" | "Range";

export interface DynamoDBPrimaryKeyExpression extends PrimaryKeyValue {
    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE;

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
}

export type PrimaryKeyValue = {
    getAttributeName(): string,
    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE,
    getAttributeValue(): any
};

export type PrimaryKeysMap = {
    partition: PrimaryKeyValue,
    range: PrimaryKeyValue
};

export interface DynamoDBRecordIndex {
    getRecordTypeId(): symbol;

    getIndexName(): string | undefined;

    isConsistentRead(): boolean;

    getTableName(): string;

    getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKeyExpression>;
}

export type Ctor<TRecord extends DynamoDBRecord> = new (...args: any[]) => TRecord;

export abstract class DynamoDBRecordIndexBase<TRecord extends DynamoDBRecord> implements DynamoDBRecordIndex {
    getIndexName(): string | undefined {
        return undefined;
    }

    abstract getPrimaryKeys(): ReadonlyArray<DynamoDBPrimaryKeyExpression>;

    abstract getRecordTypeId(): symbol;

    abstract isConsistentRead(): boolean;

    abstract getTableName(): string;

    abstract getRecordType(): Ctor<TRecord>;
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
    lastKey: PrimaryKeysMap | null;
    total: number;
    records: ReadonlyArray<TRecord>;
}
