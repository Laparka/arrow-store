import {
    COMPARE_OPERATOR_TYPE,
    PrimaryAttributeValue,
    FUNCTION_OPERATOR_TYPE,
    PRIMARY_ATTRIBUTE_TYPE,
    ArrowStoreTypeRecord,
    ArrowStoreTypeRecordId,
    ArrowStoreRecordId,
    ArrowStoreRecordCtor
} from "../types";
import {DYNAMODB_ATTRIBUTE_TYPE} from "../mappers/schemaBuilders";

const tableName: string = "arrow-store-samples";

export const RECORD_TYPES = {
    ClockRecord: "ClockRecord"
};

export class ClockRecordId implements ArrowStoreTypeRecordId<ClockRecord> {
    private readonly _clockId: string;

    constructor(clockId: string) {
        this._clockId = clockId;
    }

    getCtor(): ArrowStoreRecordCtor<ClockRecord> {
        return ClockRecord;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord'), new RangeKey(this._clockId)];
    }

    getRecordTypeId(): string {
        return RECORD_TYPES.ClockRecord;
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

export class ClockRecord implements ArrowStoreTypeRecord<ClockRecordId> {
    constructor() {
        this.isCertified = false;
        this.totalSegments = null;
        this.clockDetails = null;
        this.eligibleInCountries = [];
        this.availableInStores = [];
    }

    isCertified: boolean;
    clockType!: CLOCK_TYPE;
    totalSegments: number | null;
    brand!: string;
    clockModel!: string;
    clockDetails: ClockDetails | null;
    eligibleInCountries: string[];
    availableInStores: string[];
    reviewScore: number | undefined;

    getRecordId(): ArrowStoreRecordId {
        if (!this.clockModel) {
            throw Error(`The clockModel value is missing`)
        }

        return new ClockRecordId(this.clockModel);
    }
}

export class ClocksQuery implements ArrowStoreTypeRecordId<ClockRecord> {
    getIndexName(): string | undefined {
        return undefined;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordTypeId(): string {
        return RECORD_TYPES.ClockRecord;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getTableName(): string {
        return tableName;
    }

    getCtor(): ArrowStoreRecordCtor<ClockRecord> | undefined {
        return undefined;
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
