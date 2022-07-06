const { promisify } = require('util');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const cookieOptions = {
  expires: new Date(
    Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
  ),
  httpOnly: true
};

if (process.env.NODE_ENV === 'production') {
  cookieOptions.secure = true;
}

const catchAsync = require('../utils/catchAsync');

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

const generateToken = id => {
  return jwt.sign({ id }, process.env.SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = generateToken(user._id);

  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    role: req.body.role
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);
  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 200, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Check if email and password are-we-there-yet

  if (!email || !password) {
    next(new AppError('Please Provide Credentials', 400));
    return;
  }

  // Check if user exists // Check if password correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Invalid Credentials', 401));
  }

  // IF Okay, send Token
  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check of it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.SECRET_KEY);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401
      )
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// exports.protect = catchAsync(async (req, res, next) => {
//   // Check if Token is passed
//   if (
//     !req.headers.authorization ||
//     !req.headers.authorization.startsWith('Bearer')
//   ) {
//     next(new AppError('Unauthorize Access'), 401);
//     return;
//   }
//   const token = req.headers.authorization.split(' ')[1];
//   // Check If Token Exists
//   if (!token) {
//     next(new AppError('You are Logged Out. Please log in again!'), 401);
//     return;
//   }

//   const decoded = await promisify(jwt.verify)(token, process.env.SECRET_KEY);

//   const freshUser = await User.findById(decoded.id);
//   // CHeck if TOken is Valid and not Modified
//   if (!freshUser) {
//     next(new AppError('Access Denied'), 401);
//     return;
//   }
//   // Check if User Changed Password after Token was issued
//   if (freshUser.changedPasswordAfter(decoded.iat)) {
//     next(new AppError('Invalid Token. Please Login again'), 401);
//     return;
//   }
//   // Give access to Protected Route
//   req.user = freshUser;
//   next();
// });

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles is an array of strings [admin, lead-guide]
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Unauthorized Action'), 403);
    }

    next();
  };
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // Get User
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new AppError('User not found'), 404);
  }
  // Generate Radnom Token
  const resetToken = await user.createPassworResetToken();
  await user.save({ validateBeforeSave: false });

  // Send it back as Email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;
  //   console.log(req);

  // const message = `Forgot Your password? Reset your password by clicking the link below \n ${resetURL}\n
  // If you did not forget Please ignore this.`;

  try {
    // await sendEmail({
    //   email: user.email,
    //   Subject: 'Password Reset Request',
    //   message: message
    // })

    await new Email(user, resetURL).sendPasswordReset();
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was an error Sending Email', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Token Sent Successfully'
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // Get USer based on Toekn and

  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Set New Password

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetExpires = undefined;
  user.passwordResetToken = undefined;
  await user.save();
  // Update the passswordChangedAt

  // Log the user

  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // Get User from Collection
  const user = await User.findById(req.user.id).select('password');

  const { passwordCurrent } = req.body;

  if (!user || !(await user.correctPassword(passwordCurrent, user.password))) {
    return next(new AppError('Current Password Does Not Match'), 401);
  }

  // IF the Posted Pssword is correct
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  // Update the PasswordConfirm
  await user.save();

  // Logged the User In, Send JWT
  createSendToken(user, 200, res);
});

// Only for rendered pages, no errors!
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies && req.cookies.jwt) {
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.SECRET_KEY
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};
