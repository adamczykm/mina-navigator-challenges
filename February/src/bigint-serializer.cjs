// bigint-serializer.js
module.exports = {
    test: (val) => typeof val === 'bigint',
        print: (val) => `BigInt(${val})`,
};
