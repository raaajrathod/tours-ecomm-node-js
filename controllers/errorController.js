const AppError = require('./../utils/appError');

const sendErrorForDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err
  });
};

const sendErrorForProd = (err, res) => {
  /// Opertional Error
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } else {
    // Unknown Errors
    console.error(err);
    res.status(500).json({
      status: 'error',
      message: 'Something is Wrong at our end.'
    });
  }
};

const handleCastErrorDB = (err, res) => {
  const message = `Invalid ${err.path} : ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateError = (err, res) => {
  const message = `Name '${
    err.keyValue.name
  }' already in use. Please choose another name.`;

  return new AppError(message, 400);
};

const handleValidationError = (err, res) => {
  const errors = Object.values(err.errors).map(el => el.message);

  const message = `Invalid Input Data, ${errors.join(', ')}`;

  return new AppError(message, 400);
};

const handleJWTError = (err, res) => {
  return new AppError('Invalid Token. Please Login Again', 401);
};

const handleJWTExpiredError = (err, res) => {
  return new AppError('Session is expired Please Login again', 401);
};

module.exports = (err, req, res, next) => {
  //   console.log(err.stack);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV !== 'production') {
    sendErrorForDev(err, res);
  } else {
    let error = { ...err };
    if (error.name === 'CastError') error = handleCastErrorDB(error, res);
    if (error.code === 11000) error = handleDuplicateError(error, res);
    if (error.name === 'ValidationError')
      error = handleValidationError(error, res);
    if (error.name === 'JsonWebTokenError') error = handleJWTError(error, res);
    if (error.name === 'TokenExpiredError')
      error = handleJWTExpiredError(error, res);
    sendErrorForProd(error, res);
  }
};
