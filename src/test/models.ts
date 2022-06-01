import {
    COMPARE_OPERATOR_TYPE,
    Ctor,
    PrimaryAttributeValue,
    DynamoDBRecordBase,
    DynamoDBRecordIndexBase,
    FUNCTION_OPERATOR_TYPE,
    PRIMARY_ATTRIBUTE_TYPE
} from "../records/record";
import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

const tableName: string = "arrow-store-integration-test";

export const RECORD_TYPES = {
    ClockRecord: Symbol.for("ClockRecord")
};

export class ClockRecordId extends DynamoDBRecordIndexBase<ClockRecord> {
    private readonly _clockId: string;

    constructor(clockId: string) {
        super();
        this._clockId = clockId;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord'), new RangeKey(this._clockId)];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    getRecordType(): Ctor<ClockRecord> {
        return ClockRecord;
    }

    getIndexName(): string | undefined {
        return undefined;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getTableName(): string {
        return tableName;
    }

}

export type CLOCK_TYPE = 'Unknown' | 'Digital' | 'Analog' | 'Hybrid';

export type ClockDetails = {
    madeIn: string;
    serialNumber: string;
};

export class ClockRecord extends DynamoDBRecordBase<ClockRecordId> {
    constructor() {
        super();
        this.isCertified = false;
        this.totalSegments = null;
        this.clockDetails = null;
        this.eligibleInCountries = [];
        this.availableInStores = [];
    };

    isCertified: boolean;
    clockType!: CLOCK_TYPE;
    totalSegments: number | null;
    brand!: string;
    clockModel!: string;
    clockDetails: ClockDetails | null;
    eligibleInCountries: string[];
    availableInStores: string[];
    reviewScore: number | undefined;

    protected doGetRecordId(): ClockRecordId {
        if (!this.clockModel) {
            throw Error(`The clockModel value is missing`)
        }

        return new ClockRecordId(this.clockModel);
    }
}

export class ClocksQuery extends DynamoDBRecordIndexBase<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    getRecordType(): Ctor<ClockRecord> {
        return ClockRecord;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getTableName(): string {
        return tableName;
    }

}

export class PartitionKey implements PrimaryAttributeValue {
    private readonly _value: string;

    constructor(value: string) {
        this._value = value;
    }

    getAttributeName(): string {
        return "Namespace";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): any {
        return this._value;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Partition";
    }
}

export class RangeKey implements PrimaryAttributeValue {
    private readonly _value: string;
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;

    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE = 'Equals') {
        this._value = sortValue;
        this._comparisonOperator = operator;
    }

    getAttributeName(): string {
        return "Id";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): any {
        return this._value;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return this._comparisonOperator;
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Range";
    }
}
