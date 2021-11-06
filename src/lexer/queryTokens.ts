export type TokenType = 'GroupStart' | 'GroupEnd' | 'LambdaInitializer' | 'CommaSeparator'
    | 'Object' | 'Inverse'
    | 'String' | 'FormatString' | 'Number' | 'Boolean' | 'NullValue' | 'Undefined'
    | 'Or' | 'And'
    | 'LessThan' | 'LessThanOrEquals' | 'GreaterThan' | 'GreaterOrEquals' | 'Equals' | 'NotEquals'
    | 'Terminator';
export type QueryToken = {
    tokenType: TokenType;
    index: number;
    length: number;
}
