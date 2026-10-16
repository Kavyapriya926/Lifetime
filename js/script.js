$(document).ready(function () {
  $.ajaxSetup({ xhrFields: { withCredentials: true } });

  // Keep all sections visible by default; do not hide them with reveal logic.
  $('.reveal').addClass('is-visible');

  // Mobile menu toggle
  $('.mobile-menu-toggle').on('click', function () {
    $('.main-nav').toggleClass('mobile-open');
  });

  // Responsive navigation behavior
  $(window).on('resize', function () {
    if ($(window).width() > 1024) {
      $('.main-nav').removeClass('mobile-open');
    }
  });

  // Form validation and success message
  $('#earlyAccessForm').on('submit', function (event) {
    event.preventDefault();

    const form = $(this);
    const name = $('#name').val().trim();
    const email = $('#email').val().trim();
    const mobile = $('#mobile').val().trim();
    const interest = $('#interest').val();
    const city = $('#city').val().trim();

    let isValid = true;

    const setError = (fieldId, message) => {
      const field = $('#' + fieldId);
      const errorEl = $('.field-error[data-error-for="' + fieldId + '"]');
      field.addClass('invalid');
      errorEl.text(message);
      isValid = false;
    };

    const clearError = (fieldId) => {
      const field = $('#' + fieldId);
      const errorEl = $('.field-error[data-error-for="' + fieldId + '"]');
      field.removeClass('invalid');
      errorEl.text('');
    };

    clearError('name');
    clearError('email');
    clearError('mobile');
    clearError('interest');
    clearError('city');

    if (!name) {
      setError('name', 'Please enter your name.');
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('email', 'Please enter a valid email address.');
    }

    if (!mobile || !/^\d{10}$/.test(mobile)) {
      setError('mobile', 'Mobile number must contain 10 digits.');
    }

    if (!interest) {
      setError('interest', 'Please select your interest.');
    }

    if (!city) {
      setError('city', 'Please enter your city.');
    }

    if (!isValid) {
      $('.success-message').removeClass('visible');
      return;
    }

    const submitButton = form.find('button[type="submit"]');
    const originalText = submitButton.html();
    $('.success-message').removeClass('error warning visible');
    submitButton.prop('disabled', true).html('Registering...');

    $.ajax({
      url: apiUrl('/api/register'),
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ name, email, mobile, interest, city }),
      success: function (response) {
        $('.success-message')
          .text(response.message || 'Thank you! You have been added to the early access list.')
          .removeClass('error')
          .toggleClass('warning', response.emailSent === false)
          .addClass('visible');
        form[0].reset();
      },
      error: function (xhr) {
        const message = xhr.responseJSON?.message || 'Something went wrong. Please try again.';
        $('.success-message')
          .text(message)
          .addClass('visible')
          .removeClass('warning')
          .addClass('error');
      },
      complete: function () {
        submitButton.prop('disabled', false).html(originalText);
      }
    });
  });

  // Scroll to top when clicking footer links if needed
  $('a[href^="#"]').on('click', function (e) {
    const anchor = $(this).attr('href');
    if (!anchor || anchor === '#') {
      e.preventDefault();
      return;
    }

    const target = $(anchor);
    if (target.length) {
      e.preventDefault();
      $('html, body').animate({ scrollTop: target.offset().top - 80 }, 600);
    }
  });
});
