import {SchemaMappingBuilder, SchemaMappingProfile} from "../records/schemaMappingProvider";
import {ClockRecord, ClockRecordId, RECORD_TYPES} from "./models";

export default class TestMappingProfile implements SchemaMappingProfile {
    registerSchema(builder: SchemaMappingBuilder): void {
        builder
            .toAttributeValues<ClockRecord>(RECORD_TYPES.ClockRecord)
            .for(source => source.totalSegments, mapper => mapper.inside('recordData').asNumber("totalSegments"))
            .for(source => source.brand, mapper => mapper.inside('recordData').asString("brand", true))
        builder.toRecord<ClockRecord>(RECORD_TYPES.ClockRecord)
            .for(target => target.totalSegments, map => map.inside('recordData').asNumber('totalSegments'))
    }
}
