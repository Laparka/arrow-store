import {DYNAMODB_ATTRIBUTE_TYPE} from "./mappers/schemaBuilders";

export type COMPARE_OPERATOR_TYPE =
    'Equals'
    | 'NotEquals'
    | 'GreaterThan'
    | 'GreaterThanOrEquals'
    | 'LessThan'
    | 'LessThanOrEquals';

export type FUNCTION_OPERATOR_TYPE = "Contains" | "BeginsWith" | "Exists" | "NotExists";

export type PRIMARY_ATTRIBUTE_TYPE = "Partition" | "Range";

export interface PrimaryAttributeValue extends  AttributeDescriptor {
    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE;
    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
}

export type AttributeDescriptor = {
    getAttributeName(): string;
    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE;
    getAttributeValue(): string;
};

export type PrimaryKeysMap = {
    partition: AttributeDescriptor,
    range: AttributeDescriptor
};

export type DynamoDBQueryResult<TRecord> = {
    lastKey: PrimaryKeysMap | null;
    records: ReadonlyArray<TRecord>;
}


export type ArrowStoreRecordCtor<TRecord extends {}> = new (...args: any[]) => TRecord;

export type ArrowStoreRecord = {
    getRecordId(): ArrowStoreRecordId;
};

export type ArrowStoreTypeRecord<TRecordId extends ArrowStoreRecordId> = ArrowStoreRecord & {
};

export type ArrowStoreRecordId = {
    getIndexName(): string | undefined;
    getRecordTypeId(): string;
    isConsistentRead(): boolean;
    getTableName(): string;
    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue>;
};

export type ArrowStoreTypeRecordId<TRecord extends {}> = ArrowStoreRecordId  & {
    getCtor(): ArrowStoreRecordCtor<TRecord> | undefined;
};