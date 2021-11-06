import {ClockRecord, RECORD_TYPES} from "./models";
import {DynamoDB} from "aws-sdk";
import {
    DynamoDBMappingProfile,
    MappingBuilder,
    DynamoDBRecordMapperBase
} from "../mappers/schemaBuilders";

class ClockRecordMapper extends DynamoDBRecordMapperBase<ClockRecord> {
    protected doReadAs(attributeValue: DynamoDB.MapAttributeValue): ClockRecord {
        const record = new ClockRecord();
        const recordDataAtr = attributeValue["recordData"];
        if (!recordDataAtr) {
            throw Error(`The recordData attribute was not found`);
        }

        record.brand = this.fromStringAttr(recordDataAtr["brand"], false) ?? "";
        return record;
    }

    protected doWriteAs(record: ClockRecord, attributeValue: DynamoDB.MapAttributeValue): void {
        attributeValue["recordData"] = {
            M: {
                "totalSegments": this.toNumberAttr(record.totalSegments)
            }
        };
    }
}

export default class TestMappingProfile implements DynamoDBMappingProfile {
    register(builder: MappingBuilder): void {
        builder
            .use(RECORD_TYPES.ClockRecord, new ClockRecordMapper());
        builder
            .createReaderFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, readAs => readAs.nestedIn('recordData').asNumber("totalSegments"))
            .forMember(x => x.brand, readAs => readAs.nestedIn('recordData').asString("brand"))
            .forMember(x => x.clockDetails, readAs => readAs.nestedIn('recordData')
                .asObject("clockDetails", nested => nested.forMember(x => x.madeIn, from => from.asString("brand"))));
        builder
            .createWriterFor<ClockRecord>(RECORD_TYPES.ClockRecord)
            .forMember(x => x.totalSegments, writeTo => writeTo.nestedIn('recordData').asNumber('totalSegments'))
            .forMember(x => x.clockDetails, writeTo => writeTo.nestedIn('recordData')
                .asObject("clockDetails", nested =>
                    nested.forMember(x => x.madeIn, nestedWrite => nestedWrite.asString("madeIn"))
                        .forMember(x => x.serialNumber, nestedWrite => nestedWrite.asNumber("serialNumber"))));
    }
}
