import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

export type COMPARE_OPERATOR_TYPE = 'Equals' | 'NotEquals' | 'GreaterThan' | 'GreaterThanOrEquals' | 'LessThan' | 'LessThanOrEquals';

export type FUNCTION_OPERATOR_TYPE = "Contains" | "BeginsWith" | "EndsWith" | "Exists" | "NotExists";

export interface DynamoDBAttributeQuery {
    attributeName: string;
    attributeValue: any;
    attributeType: DYNAMODB_ATTRIBUTE_TYPE;
    get operator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;
}

export interface DynamoDBRecordIndex {
    indexName(): string | undefined;
    isConsistentRead(): boolean;
    tableName(): string;
    getPrimaryKeys(): ReadonlyArray<DynamoDBAttributeQuery>;
}

export type Ctor<TRecord extends DynamoDBRecord> = new (...args: any[]) => TRecord;
export abstract class DynamoDBRecordIndexBase<TRecord extends DynamoDBRecord> implements DynamoDBRecordIndex {
    abstract getRecordTypeId(): symbol;
    abstract getPrimaryKeys(): ReadonlyArray<DynamoDBAttributeQuery>;

    indexName(): string | undefined {
        return undefined;
    }

    abstract isConsistentRead(): boolean;
    abstract tableName(): string;

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
