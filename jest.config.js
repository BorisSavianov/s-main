module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^apps/(.*)$': '<rootDir>/apps/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  roots: ['<rootDir>/apps/auth-service/src', '<rootDir>/apps/chat-service/src', '<rootDir>/apps/user-service/src'],
};
