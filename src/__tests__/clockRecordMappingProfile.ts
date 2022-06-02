import {ClockRecord, RECORD_TYPES} from "./models";
import {
    DynamoDBAttributeSchema,
    DynamoDBMappingProfile,
    DynamoDBRecordSchemaSourceBase,
    MappingBuilder
} from "../mappers/schemaBuilders";

export class ClockRecordSchemaSource extends DynamoDBRecordSchemaSourceBase<ClockRecord> {
    getWritingSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this.getSchema();
    }

    getSchema(): Map<string, DynamoDBAttributeSchema> {
        return new Map<string, DynamoDBAttributeSchema>([
            ["clockType", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "CLOCK_TYPE",
                    attributeType: "S",
                    lastChildAttributeType: "S"
                }
            }],
            ["totalSegments", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "N",
                nested: {
                    attributeName: "TOTAL_SEGMENTS",
                    attributeType: "N",
                    lastChildAttributeType: "N"
                }
            }],
            ["brand", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "BRAND",
                    attributeType: "S",
                    lastChildAttributeType: "S"
                }
            }],
            ["isCertified", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "BOOL",
                nested: {
                    attributeName: "isCertified",
                    attributeType: "BOOL",
                    lastChildAttributeType: "BOOL"
                }
            }],
            ["clockDetails", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "M",
                nested: {
                    attributeName: "CLOCK_DETAILS",
                    attributeType: "M",
                    lastChildAttributeType: "M"
                }
            }],
            ["clockDetails.madeIn", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "CLOCK_DETAILS",
                    attributeType: "M",
                    lastChildAttributeType: "S",
                    nested: {
                        attributeName: "MADE_IN",
                        attributeType: "S",
                        lastChildAttributeType: "S"
                    }
                }
            }],
            ["clockDetails.serialNumber", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "CLOCK_DETAILS",
                    attributeType: "M",
                    lastChildAttributeType: "S",
                    nested: {
                        attributeName: "serialNumber",
                        attributeType: "S",
                        lastChildAttributeType: "S"
                    }
                }
            }]
        ]);
    }
}

export class ClockRecordMappingProfile implements DynamoDBMappingProfile {
    register(builder: MappingBuilder): void {
        builder
            .createReaderFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, readAs => readAs.asNumber("RECORD_DATA.TOTAL_SEGMENTS"))
            .forMember(x => x.brand, readAs => readAs.asString("RECORD_DATA.BRAND"))
            .forMember(x => x.clockModel, readAs => readAs.asString("Id"))
            .forMember(x => x.clockType, readAs => readAs.asString("RECORD_DATA.CLOCK_TYPE"))
            .forMember(x => x.isCertified, readAs => readAs.asBool("RECORD_DATA.IS_CERTIFIED"))
            .forMember(x => x.eligibleInCountries, readAs => readAs.asStringsList("RECORD_DATA.ELIGIBLE_IN_COUNTRIES"))
            .forMember(x => x.availableInStores, readAs => readAs.asStringsList("RECORD_DATA.AVAILABLE_IN_STORES"))
            .forMember(x => x.clockDetails, readAs => readAs.asObject("RECORD_DATA.CLOCK_DETAILS", nested =>
                nested
                    .forMember(x => x!.madeIn, from => from.asString("MADE_IN"))
                    .forMember(x => x!.serialNumber, from => from.asString("SERIAL_NUMBER"))));
        builder
            .createWriterFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, writeAs => writeAs.asNumber("RECORD_DATA.TOTAL_SEGMENTS"))
            .forMember(x => x.brand, writeAs => writeAs.asString("RECORD_DATA.BRAND"))
            .forMember(x => x.clockType, writeAs => writeAs.asString("RECORD_DATA.CLOCK_TYPE"))
            .forMember(x => x.isCertified, writeAs => writeAs.asBool("RECORD_DATA.IS_CERTIFIED"))
            .forMember(x => x.availableInStores, writeAs => writeAs.asStringsList("RECORD_DATA.AVAILABLE_IN_STORES"))
            .forMember(x => x.eligibleInCountries, writeAs => writeAs.asStringsList("RECORD_DATA.ELIGIBLE_IN_COUNTRIES"))
            .forMember(x => x.clockDetails, writeAs => writeAs.asObject("RECORD_DATA.CLOCK_DETAILS", nested =>
                nested
                    .forMember(x => x!.madeIn, from => from.asString("MADE_IN"))
                    .forMember(x => x!.serialNumber, from => from.asString("SERIAL_NUMBER"))));
    }
}
