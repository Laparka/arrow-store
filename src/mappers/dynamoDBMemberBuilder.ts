import {
    DYNAMODB_ATTRIBUTE_TYPE,
    DynamoDBAttributeSchema,
    DynamoDBMemberSchemaBuilder,
    DynamoDBRecordSchemaBuilder
} from "./schemaBuilders";
import FromAttributeSchemaBuilder from "./fromAttributeSchemaBuilder";

export default class DynamoDBMemberBuilder<TMember> implements DynamoDBMemberSchemaBuilder<TMember> {
    private readonly _memberName: string;

    private readonly _attributeSchema: Map<string, DynamoDBAttributeSchema>;

    constructor(memberName: string) {
        this._memberName = memberName;
        this._attributeSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    asBool(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("BOOL", attributeName));
    }

    asNumber(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("N", attributeName));
    }

    asObject(attributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void {
        const nestedBuilder = new FromAttributeSchemaBuilder<TMember>();
        map(nestedBuilder);
        nestedBuilder.getRecordSchema().forEach((memberSchema, memberName) => {
            const name = [this._memberName, memberName].join('.');
            const parentSchemas = this._asLastType("M", attributeName, memberSchema.lastChildAttributeType);
            const lastChildSchema = parentSchemas[1];
            lastChildSchema.nested = memberSchema;
            this._attributeSchema.set(name, parentSchemas[0]);
        });
    }

    asString(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("S", attributeName));
    }

    getMemberSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
       return this._attributeSchema;
    }

    private _asTopLevel(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeName: string): DynamoDBAttributeSchema {
        return this._asLastType(attributeType, attributeName, attributeType)[0];
    }

    private _asLastType(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeName: string, lastChildType?: DYNAMODB_ATTRIBUTE_TYPE): DynamoDBAttributeSchema[] {
        if (!attributeName) {
            throw Error(`Attribute name is required`);
        }

        const attributePath = attributeName.split('.');
        if (attributePath.length === 0) {
            throw Error(`The attributeName is missing`);
        }

        let attributeSchema: DynamoDBAttributeSchema = {
            attributeType: attributeType,
            attributeName: attributePath[attributePath.length - 1],
            lastChildAttributeType: lastChildType ?? attributeType
        };

        const lastSchema = attributeSchema;
        for(let i = attributePath.length - 2; i >= 0; i--) {
            const nested: DynamoDBAttributeSchema = {
                attributeType: "M",
                attributeName: attributePath[i],
                lastChildAttributeType: lastChildType ?? attributeType
            };

            nested.nested = attributeSchema;
            attributeSchema = nested;
        }

        return [attributeSchema, lastSchema];
    }
}

