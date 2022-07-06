/* eslint-disable node/no-unsupported-features/es-syntax */
// eslint-disable-next-line node/no-unsupported-features/es-syntax
import axios from 'axios';
import { showAlert } from './alerts';
// eslint-disable-next-line no-undef
const stripe = Stripe('pk_test_qXa7Dus2doqT9pRCuREJg5wS00Z41XNA6y');
// let elements = stripe.elements();

// eslint-disable-next-line import/prefer-default-export
export const bookTour = async tourId => {
  //  Get Cheekout session for
  try {
    const session = await axios(`/api/v1/booking/checkout-session/${tourId}`);
    // console.log(session);

    // 2) Create checkout form + chanre credit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id
    });
  } catch (err) {
    // console.log(err);
    showAlert('error', err);
  }
};
