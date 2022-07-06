const express = require('express');
const reviewController = require('./../controllers/reviewController');
const authController = require('../controllers/authController');

const router = express.Router({
  mergeParams: true
});

router.route('/').get(reviewController.getAllReviews);
router.route('/:id').get(reviewController.getReview);

router.use(authController.protect);
router.use(authController.restrictTo('user'));
// Protect and Retrict Below Routes to Users ONLY
router
  .route('/')
  .post(reviewController.setTourAndUserIds, reviewController.createReview);

router
  .route('/:id')
  .delete(reviewController.deleteReview)
  .patch(reviewController.updateReview);

module.exports = router;
