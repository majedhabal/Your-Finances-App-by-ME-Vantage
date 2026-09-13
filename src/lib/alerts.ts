import Swal from 'sweetalert2';

export const showAlert = (message: string, title: string = 'Your Finances') => {
  return Swal.fire({
    title,
    text: message,
    confirmButtonColor: '#111C2D',
    confirmButtonText: 'OK',
    customClass: {
      popup: 'font-sans rounded-2xl',
      title: 'font-bold text-xl text-[#111C2D]',
      htmlContainer: 'text-neutral-600',
      confirmButton: 'font-bold rounded-xl px-6 py-2.5'
    }
  });
};

export const showConfirm = async (message: string, title: string = 'Your Finances') => {
  const result = await Swal.fire({
    title,
    text: message,
    showCancelButton: true,
    confirmButtonColor: '#111C2D',
    cancelButtonColor: '#ef4444',
    confirmButtonText: 'Confirm',
    cancelButtonText: 'Cancel',
    customClass: {
      popup: 'font-sans rounded-2xl',
      title: 'font-bold text-xl text-[#111C2D]',
      htmlContainer: 'text-neutral-600',
      confirmButton: 'font-bold rounded-xl px-6 py-2.5',
      cancelButton: 'font-bold rounded-xl px-6 py-2.5 bg-neutral-100 text-neutral-600 border border-neutral-200 shadow-none hover:bg-neutral-200'
    }
  });
  return result.isConfirmed;
};
