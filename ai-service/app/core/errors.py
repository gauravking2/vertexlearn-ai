"""Structured API errors."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def bad_request(message: str = "Bad request") -> ApiError:
    return ApiError(400, "BAD_REQUEST", message)


def unauthorized(message: str = "Unauthorized") -> ApiError:
    return ApiError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "Forbidden") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(message: str = "Not found") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)
