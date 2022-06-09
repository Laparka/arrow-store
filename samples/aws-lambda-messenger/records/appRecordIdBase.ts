import {
    ArrowStoreRecord, ArrowStoreRecordCtor, ArrowStoreTypeRecord, ArrowStoreTypeRecordId,
    COMPARE_OPERATOR_TYPE,
    DYNAMODB_ATTRIBUTE_TYPE, FUNCTION_OPERATOR_TYPE, PRIMARY_ATTRIBUTE_TYPE,
    PrimaryAttributeValue
} from "arrow-store";

export class PartitionAttributeValue implements PrimaryAttributeValue {
    private readonly _attributeValue: string;
    constructor(attributeValue: string) {
        this._attributeValue = attributeValue;
    }

    getAttributeName(): string {
        return "Namespace";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): string {
        return this._attributeValue;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Partition";
    }
}

export class RangeAttributeValue implements PrimaryAttributeValue {
    private readonly _attributeValue: string;
    constructor(attributeValue: string) {
        this._attributeValue = attributeValue;
    }

    getAttributeName(): string {
        return "RecordId";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): string {
        return this._attributeValue;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Range";
    }
}

export abstract class AppRecordIdBase<TRecord extends ArrowStoreRecord> implements ArrowStoreTypeRecordId<TRecord> {
    abstract getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue>;
    abstract getRecordTypeId(): string;
    abstract isConsistentRead(): boolean;
    abstract getCtor(): ArrowStoreRecordCtor<TRecord> | undefined;
    abstract getIndexName(): string | undefined;

    getTableName(): string {
        const tableName = process.env["DYNAMODB_TABLE"];
        if (!tableName) {
            throw Error(`The DYNAMODB_TABLE Environment variable is not provided for the Lambda Function configuration`);
        }

        return tableName;
    }
}