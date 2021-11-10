import {ClockRecord, RECORD_TYPES} from "./models";
import {
    DynamoDBAttributeSchema,
    DynamoDBMappingProfile, DynamoDBRecordSchemaSourceBase,
    MappingBuilder
} from "../mappers/schemaBuilders";

export class ClockRecordSchemaSource extends DynamoDBRecordSchemaSourceBase<ClockRecord> {
    getReadingSchema(): Map<string, DynamoDBAttributeSchema> {
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

export class TestMappingProfile implements DynamoDBMappingProfile {
    register(builder: MappingBuilder): void {
        builder
            .createReaderFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, readAs => readAs.asNumber("RECORD_DATA.TOTAL_SEGMENTS"))
            .forMember(x => x.brand, readAs => readAs.asString("RECORD_DATA.BRAND"))
            .forMember(x => x.clockDetails, readAs => readAs.asObject("RECORD_DATA.CLOCK_DETAILS", nested =>
                    nested.forMember(x => x!.madeIn, from => from.asString("MADE_IN"))));
        /*builder
            .createWriterFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, writeTo => writeTo.nestedIn('recordData').asNumber('totalSegments'))
            .forMember(x => x.clockDetails, writeTo => writeTo.nestedIn('recordData')
                .asObject("clockDetails", nested =>
                    nested.forMember(x => x.madeIn, nestedWrite => nestedWrite.asString("madeIn"))
                        .forMember(x => x.serialNumber, nestedWrite => nestedWrite.asNumber("serialNumber"))));*/
    }
}
