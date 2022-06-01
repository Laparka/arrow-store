import DynamoDBMappingBuilder from "../mappers/mappingBuilder";
import {ClockRecordSchemaSource, ClockRecordMappingProfile } from "./clockRecordMappingProfile";
import {ClockRecord, RECORD_TYPES} from "./models";
import {DefaultDynamoDBRecordMapper} from "../mappers/recordMapper";
import assert from "assert";
import {AttributeMap} from "aws-sdk/clients/dynamodb";

test("Must build mapping schema provider", () => {
    const schemaBuilder = new DynamoDBMappingBuilder();
    const profile = new ClockRecordMappingProfile();
    profile.register(schemaBuilder);
    const schemaProvider = schemaBuilder.buildSchemaProvider();
    assert(!!schemaProvider);
    const readingSchema = schemaProvider.getReadingSchema(RECORD_TYPES.ClockRecord);
    assert(!!readingSchema);
});


test("Must map DynamoDB attribute map to a ClockRecord", () => {
    const schemaBuilder = new DynamoDBMappingBuilder();
    schemaBuilder.use(RECORD_TYPES.ClockRecord, new ClockRecordSchemaSource())
    const profile = new ClockRecordMappingProfile();
    profile.register(schemaBuilder);
    const schemaProvider = schemaBuilder.buildSchemaProvider();
    const mapper = new DefaultDynamoDBRecordMapper(schemaProvider);
    const expectedClock: ClockRecord = new ClockRecord();
    expectedClock.brand = "Fossil";
    expectedClock.totalSegments = 60;
    expectedClock.clockModel = "DW8F1";
    expectedClock.clockType = "Hybrid";
    expectedClock.isCertified = true;
    expectedClock.clockDetails = {
        madeIn: "CHN",
        serialNumber: "UK7-DW8"
    };
    const attributes: AttributeMap = {
        "Namespace": {S: "ClockRecord"},
        "Id": {S: "FTW1194"},
        "RECORD_DATA": {
            M: {
                "BRAND": {
                    S: expectedClock.brand
                },
                "TOTAL_SEGMENTS": {
                    N: expectedClock.totalSegments.toString()
                },
                "CLOCK_MODEL": {
                    S: expectedClock.clockModel
                },
                "CLOCK_TYPE": {
                    S: expectedClock.clockType
                },
                "IS_CERTIFIED": {
                    BOOL: expectedClock.isCertified
                },
                "CLOCK_DETAILS": {
                    M: {
                        "MADE_IN": {
                            S: expectedClock.clockDetails.madeIn
                        },
                        "SERIAL_NUMBER": {
                            S: expectedClock.clockDetails.serialNumber
                        }
                    }
                }
            }
        }
    }

    const clockRecord = mapper.toRecord<ClockRecord>(ClockRecord, RECORD_TYPES.ClockRecord, attributes);
    assert(JSON.stringify(expectedClock), JSON.stringify(clockRecord));
});
