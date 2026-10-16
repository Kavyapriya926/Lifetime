$(document).ready(function () {
  $.ajaxSetup({ xhrFields: { withCredentials: true } });

  let registrations = [];
  const loginPanel = $('#loginPanel');
  const dashboardPanel = $('#dashboardPanel');
  const rows = $('#registrationRows');

  function showDashboard() {
    loginPanel.prop('hidden', true);
    dashboardPanel.prop('hidden', false);
    loadRegistrations();
  }

  function showLogin(message) {
    dashboardPanel.prop('hidden', true);
    loginPanel.prop('hidden', false);
    $('#loginMessage').text(message || '');
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  }

  function addCell(row, text) {
    $('<td>').text(text || '').appendTo(row);
  }

  function renderRegistrations() {
    const query = $('#searchInput').val().trim().toLowerCase();
    const filtered = registrations.filter((entry) =>
      [entry.name, entry.email, entry.mobile, entry.interest, entry.city]
        .some((value) => String(value || '').toLowerCase().includes(query))
    );

    rows.empty();
    filtered.forEach((entry) => {
      const row = $('<tr>');
      addCell(row, entry.name);
      addCell(row, entry.email);
      addCell(row, entry.mobile);
      addCell(row, entry.interest);
      addCell(row, entry.city);
      addCell(row, formatDate(entry.createdAt));

      const statusCell = $('<td>');
      $('<span>')
        .addClass('status')
        .addClass(entry.emailStatus === 'sent' ? 'sent' : entry.emailStatus === 'failed' ? 'failed' : '')
        .text(String(entry.emailStatus || 'unknown').replaceAll('_', ' '))
        .appendTo(statusCell);
      row.append(statusCell);

      const actionCell = $('<td>');
      if (entry.emailStatus !== 'sent') {
        $('<button>')
          .attr({ type: 'button', 'aria-label': `Retry welcome email to ${entry.email}` })
          .addClass('delete-button')
          .text('Retry email')
          .on('click', () => retryEmail(entry))
          .appendTo(actionCell);
      }
      $('<button>')
        .attr({ type: 'button', 'aria-label': `Delete registration for ${entry.name}` })
        .addClass('delete-button')
        .text('Delete')
        .on('click', () => deleteRegistration(entry))
        .appendTo(actionCell);
      row.append(actionCell);
      rows.append(row);
    });

    $('#totalCount').text(registrations.length);
    $('#emailCount').text(registrations.filter((entry) => entry.emailStatus === 'sent').length);
    $('#pendingCount').text(registrations.filter((entry) => entry.emailStatus !== 'sent').length);
    $('#emptyState').prop('hidden', filtered.length !== 0);
  }

  function retryEmail(entry) {
    $('#dashboardMessage').text('');
    $.ajax({
      url: apiUrl(`/api/admin/registrations/${encodeURIComponent(entry.id)}/retry-email`),
      method: 'POST',
    })
      .done((response) => {
        $('#dashboardMessage').text(response.message);
        loadRegistrations();
      })
      .fail((xhr) => {
        $('#dashboardMessage').text(xhr.responseJSON?.message || 'Could not send the welcome email.');
      });
  }

  function loadRegistrations() {
    $('#dashboardMessage').text('');
    $('#refreshButton').prop('disabled', true);
    $.getJSON(apiUrl('/api/admin/registrations'))
      .done((response) => {
        registrations = response.registrations;
        renderRegistrations();
      })
      .fail((xhr) => {
        if (xhr.status === 401) {
          showLogin('Your session expired. Please sign in again.');
          return;
        }
        $('#dashboardMessage').text(xhr.responseJSON?.message || 'Could not load registrations.');
      })
      .always(() => $('#refreshButton').prop('disabled', false));
  }

  function deleteRegistration(entry) {
    if (!window.confirm(`Delete the registration for ${entry.name} (${entry.email})?`)) {
      return;
    }

    $.ajax({
      url: apiUrl(`/api/admin/registrations/${encodeURIComponent(entry.id)}`),
      method: 'DELETE',
    })
      .done(() => {
        registrations = registrations.filter((item) => item.id !== entry.id);
        renderRegistrations();
        $('#dashboardMessage').text('Registration deleted.');
      })
      .fail((xhr) => {
        $('#dashboardMessage').text(xhr.responseJSON?.message || 'Could not delete this registration.');
      });
  }

  function exportCsv() {
    const headers = ['Name', 'Email', 'Mobile', 'Interest', 'City', 'Registered', 'Email status'];
    const csvCell = (value) => {
      const text = String(value ?? '');
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    };
    const content = [
      headers,
      ...registrations.map((entry) => [
        entry.name,
        entry.email,
        entry.mobile,
        entry.interest,
        entry.city,
        formatDate(entry.createdAt),
        entry.emailStatus,
      ]),
    ].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lifetime-registrations.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  $('#loginForm').on('submit', function (event) {
    event.preventDefault();
    const button = $(this).find('button[type="submit"]');
    button.prop('disabled', true);
    $('#loginMessage').text('');

    $.ajax({
      url: apiUrl('/api/admin/login'),
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        username: $('#username').val(),
        password: $('#password').val(),
      }),
    })
      .done(() => {
        $('#password').val('');
        showDashboard();
      })
      .fail((xhr) => {
        $('#loginMessage').text(xhr.responseJSON?.message || 'Could not sign in.');
      })
      .always(() => button.prop('disabled', false));
  });

  $('#logoutButton').on('click', function () {
    $.post(apiUrl('/api/admin/logout')).always(() => showLogin('You have been signed out.'));
  });

  $('#searchInput').on('input', renderRegistrations);
  $('#refreshButton').on('click', loadRegistrations);
  $('#exportButton').on('click', exportCsv);

  $.getJSON(apiUrl('/api/admin/me'))
    .done(showDashboard)
    .fail((xhr) => {
      if (xhr.status === 503) {
        showLogin(xhr.responseJSON?.message || 'Admin login is not configured.');
      } else {
        showLogin('');
      }
    });
});
