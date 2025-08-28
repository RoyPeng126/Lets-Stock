// /errors/index.js
class AppError extends Error {
    constructor(message, status = 500, code = 'INTERNAL_ERROR', publicMessage) {
        super(message);
        this.status = status;
        this.code = code;
        this.publicMessage = publicMessage || (status >= 500 ? 'Internal Server Error' : message);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Bad Request', publicMessage) {
        super(message, 400, 'BAD_REQUEST', publicMessage);
    }
}

class UnprocessableEntityError extends AppError {
    constructor(message = 'Unprocessable Entity', publicMessage) {
        super(message, 422, 'UNPROCESSABLE_ENTITY', publicMessage);
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflict', publicMessage) {
        super(message, 409, 'CONFLICT', publicMessage);
    }
}

class TooManyRequestsError extends AppError {
    constructor(message = 'Too Many Requests', publicMessage) {
        super(message, 429, 'TOO_MANY_REQUESTS', publicMessage);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized', publicMessage) {
        super(message, 401, 'UNAUTHORIZED', publicMessage);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden', publicMessage) {
        super(message, 403, 'FORBIDDEN', publicMessage);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Not Found', publicMessage) {
        super(message, 404, 'NOT_FOUND', publicMessage);
    }
}

class ConfigError extends AppError {
    constructor(message = 'Server Misconfig') {
        super(message, 500, 'SERVER_CONFIG', 'Internal Server Error');
    }
}

module.exports = {
    AppError,
    BadRequestError,
    UnprocessableEntityError,
    ConflictError,
    TooManyRequestsError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConfigError,
};
