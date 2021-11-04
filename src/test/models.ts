import {
    COMPARE_OPERATOR_TYPE,
    RecordBase,
    RecordIdAttribute,
    RecordQueryBase,
    RecordType
} from "../records/record";

export class ClockRecordId extends RecordQueryBase<ClockRecord> {
    private readonly _clockId: string;
    constructor(clockId: string) {
        super();
        this._clockId = clockId;
    }

    getPrimaryKeys(): ReadonlyArray<RecordIdAttribute> {
        return [new PartitionKey('ClockRecord'), new RangeKey(this._clockId)];
    }

    getRecordType(): RecordType<ClockRecord> {
        return ClockRecord;
    }

}

export type CLOCK_TYPE = 'Unknown' |  'Digital' | 'Analog';

export class ClockRecord extends RecordBase<ClockRecordId> {
    constructor() {
        super();
        this.clockModel = '';
        this.clockType = 'Unknown';
        this.totalSegments = 12;
        this.brand = 'NoName';
    }

    clockType: CLOCK_TYPE;
    totalSegments: number;
    brand: string;
    clockModel: string;
    protected doGetRecordId(): ClockRecordId {
        return new ClockRecordId(this.clockModel);
    }
}

export class ClocksQuery extends RecordQueryBase<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<RecordIdAttribute> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordType(): RecordType<ClockRecord> {
        return ClockRecord;
    }

}

export class PartitionKey implements RecordIdAttribute {
    constructor(partitionValue: string) {
        this.attributeName = 'Namespace';
        this.attributeValue = partitionValue;
    }

    attributeName: string;
    attributeValue: string;

    get operator(): COMPARE_OPERATOR_TYPE {
        return "Equals";
    }
}

export class RangeKey implements RecordIdAttribute {
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE;
    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE = 'Equals') {
        this.attributeName = 'RecordId';
        this.attributeValue = sortValue;
        this._comparisonOperator = operator;
    }

    attributeName: string;
    attributeValue: string;

    get operator(): COMPARE_OPERATOR_TYPE {
        return this._comparisonOperator;
    }
}
