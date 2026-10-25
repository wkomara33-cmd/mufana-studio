"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase, isSupabaseConfigured, Barang, User } from "@/src/lib/supabase";

export default function HomePage() {
  // Autentikasi state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authFormData, setAuthFormData] = useState({
    username: "",
    password: "",
    nama: "",
    konfirmasiPassword: "",
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Data state
  const [barangList, setBarangList] = useState<Barang[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Layout mode: "katalog" (grid kartu studio) atau "tabel" (tabel)
  const [viewMode, setViewMode] = useState<"katalog" | "tabel">("katalog");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Barang | null>(null);
  const [deletingItem, setDeletingItem] = useState<Barang | null>(null);

  // Form states barang
  const [formData, setFormData] = useState({
    nama: "",
    harga: "",
    stok: "0",
    foto: "",
  });
  const [formErrors, setFormErrors] = useState<{
    nama?: string;
    harga?: string;
    stok?: string;
  }>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper formatting Rupiah
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Tampilkan notifikasi sukses sementara
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Cek user yang tersimpan di localStorage saat pertama kali load
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mufana_studio_user");
      if (stored) {
        const parsed: User = JSON.parse(stored);
        if (parsed && parsed.username) {
          setCurrentUser(parsed);
        }
      }
    } catch {
      localStorage.removeItem("mufana_studio_user");
    } finally {
      setAuthChecking(false);
    }
  }, []);

  // Fetch daftar barang saat user login
  const fetchBarang = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("barang")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setBarangList(data || []);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(
        error?.message || "Gagal memuat data koleksi barang. Periksa koneksi Supabase Anda."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchBarang();
    }
  }, [currentUser]);

  // Handler Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const { username, password } = authFormData;
    if (!username.trim() || !password.trim()) {
      setAuthError("Username dan password wajib diisi.");
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthError("Konfigurasi Supabase belum disetel di .env.local");
      return;
    }

    try {
      setAuthLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select("id, username, nama, password")
        .eq("username", username.trim().toLowerCase())
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116" || error.message.includes("relation \"users\" does not exist")) {
          throw new Error("Tabel 'users' belum dibuat di Supabase. Silakan jalankan script SQL pembuatan tabel users.");
        }
        throw error;
      }

      if (!data || data.password !== password) {
        setAuthError("Username atau password salah.");
        return;
      }

      const loggedUser: User = {
        id: data.id,
        username: data.username,
        nama: data.nama || data.username,
      };

      setCurrentUser(loggedUser);
      localStorage.setItem("mufana_studio_user", JSON.stringify(loggedUser));
      setAuthFormData({ username: "", password: "", nama: "", konfirmasiPassword: "" });
      showSuccess(`Selamat datang di Mufana Studio, ${loggedUser.nama}!`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setAuthError(error?.message || "Terjadi kesalahan saat masuk.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handler Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const { nama, username, password, konfirmasiPassword } = authFormData;

    if (!nama.trim()) {
      setAuthError("Nama lengkap wajib diisi.");
      return;
    }

    if (!username.trim() || username.includes(" ")) {
      setAuthError("Username tidak boleh kosong dan tidak boleh mengandung spasi.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password minimal harus 6 karakter.");
      return;
    }

    if (password !== konfirmasiPassword) {
      setAuthError("Konfirmasi password tidak cocok.");
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthError("Konfigurasi Supabase belum disetel di .env.local");
      return;
    }

    try {
      setAuthLoading(true);

      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("username", username.trim().toLowerCase())
        .maybeSingle();

      if (checkError && !checkError.message.includes("PGRST116")) {
        if (checkError.message.includes("relation \"users\" does not exist")) {
          throw new Error("Tabel 'users' belum dibuat di Supabase. Silakan jalankan script SQL pembuatan tabel users.");
        }
        throw checkError;
      }

      if (existingUser) {
        setAuthError("Username tersebut sudah digunakan. Silakan pilih username lain.");
        return;
      }

      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            nama: nama.trim(),
            username: username.trim().toLowerCase(),
            password: password,
          },
        ])
        .select("id, username, nama")
        .single();

      if (insertError) throw insertError;

      const loggedUser: User = {
        id: newUser.id,
        username: newUser.username,
        nama: newUser.nama,
      };

      setCurrentUser(loggedUser);
      localStorage.setItem("mufana_studio_user", JSON.stringify(loggedUser));
      setAuthFormData({ username: "", password: "", nama: "", konfirmasiPassword: "" });
      showSuccess(`Pendaftaran berhasil! Selamat datang di Mufana Studio, ${loggedUser.nama}.`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setAuthError(error?.message || "Gagal mendaftarkan akun baru.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handler Logout
  const handleLogout = () => {
    localStorage.removeItem("mufana_studio_user");
    setCurrentUser(null);
    setBarangList([]);
    setSearchQuery("");
  };

  // Filter pencarian berdasarkan nama
  const filteredBarang = useMemo(() => {
    if (!searchQuery.trim()) return barangList;
    const q = searchQuery.toLowerCase().trim();
    return barangList.filter((item) => item.nama.toLowerCase().includes(q));
  }, [barangList, searchQuery]);

  // Validasi form barang
  const validateForm = () => {
    const errors: { nama?: string; harga?: string; stok?: string } = {};

    if (!formData.nama.trim()) {
      errors.nama = "Nama barang tidak boleh kosong.";
    }

    const hargaNum = parseInt(formData.harga, 10);
    if (isNaN(hargaNum) || hargaNum < 0) {
      errors.harga = "Harga tidak boleh kosong dan tidak boleh bernilai negatif.";
    }

    const stokNum = parseInt(formData.stok, 10);
    if (isNaN(stokNum) || stokNum < 0) {
      errors.stok = "Stok tidak boleh bernilai negatif.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Kompresi dan pembacaan foto dari file input (maks 800px)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Harap pilih file gambar (JPG, PNG, atau WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          setFormData((prev) => ({ ...prev, foto: dataUrl }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, foto: "" }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Reset & Buka Form Tambah Barang
  const openAddModal = () => {
    setFormData({ nama: "", harga: "", stok: "0", foto: "" });
    setFormErrors({});
    setIsAddModalOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Buka Form Edit Barang
  const openEditModal = (item: Barang) => {
    setEditingItem(item);
    setFormData({
      nama: item.nama,
      harga: item.harga.toString(),
      stok: item.stok.toString(),
      foto: item.foto || "",
    });
    setFormErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Tutup Modal
  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
    setFormErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Simpan barang baru
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!isSupabaseConfigured) {
      setErrorMessage("Konfigurasi Supabase belum disetel di file .env.local");
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const hargaNum = parseInt(formData.harga, 10);
      const stokNum = parseInt(formData.stok, 10);

      const payload = {
        nama: formData.nama.trim(),
        harga: hargaNum,
        stok: stokNum,
        foto: formData.foto || null,
      };

      const { data, error } = await supabase
        .from("barang")
        .insert([payload])
        .select();

      if (error) {
        if (error.message.includes("column \"foto\" of relation \"barang\" does not exist")) {
          throw new Error("Kolom 'foto' belum ditambahkan di tabel 'barang'. Silakan jalankan: ALTER TABLE barang ADD COLUMN foto TEXT; di SQL Editor Supabase.");
        }
        throw error;
      }

      if (data && data.length > 0) {
        setBarangList((prev) => [data[0], ...prev]);
      } else {
        await fetchBarang();
      }

      closeModal();
      showSuccess(`Produk "${formData.nama.trim()}" berhasil ditambahkan ke katalog!`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error?.message || "Gagal menambahkan produk baru.");
    } finally {
      setActionLoading(false);
    }
  };

  // Update barang
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!validateForm()) return;

    if (!isSupabaseConfigured) {
      setErrorMessage("Konfigurasi Supabase belum disetel di file .env.local");
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const hargaNum = parseInt(formData.harga, 10);
      const stokNum = parseInt(formData.stok, 10);

      const payload = {
        nama: formData.nama.trim(),
        harga: hargaNum,
        stok: stokNum,
        foto: formData.foto || null,
      };

      const { error } = await supabase
        .from("barang")
        .update(payload)
        .eq("id", editingItem.id);

      if (error) {
        if (error.message.includes("column \"foto\" of relation \"barang\" does not exist")) {
          throw new Error("Kolom 'foto' belum ditambahkan di tabel 'barang'. Silakan jalankan: ALTER TABLE barang ADD COLUMN foto TEXT; di SQL Editor Supabase.");
        }
        throw error;
      }

      setBarangList((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                nama: formData.nama.trim(),
                harga: hargaNum,
                stok: stokNum,
                foto: formData.foto || null,
              }
            : item
        )
      );

      closeModal();
      showSuccess(`Data produk "${formData.nama.trim()}" berhasil diperbarui!`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error?.message || "Gagal memperbarui data barang.");
    } finally {
      setActionLoading(false);
    }
  };

  // Hapus barang
  const handleDelete = async () => {
    if (!deletingItem) return;

    if (!isSupabaseConfigured) {
      setErrorMessage("Konfigurasi Supabase belum disetel di file .env.local");
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const { error } = await supabase
        .from("barang")
        .delete()
        .eq("id", deletingItem.id);

      if (error) throw error;

      const namaDeleted = deletingItem.nama;
      setBarangList((prev) => prev.filter((item) => item.id !== deletingItem.id));
      setDeletingItem(null);
      showSuccess(`Produk "${namaDeleted}" berhasil dihapus.`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error?.message || "Gagal menghapus data barang.");
    } finally {
      setActionLoading(false);
    }
  };

  // Layar Tunggu saat Cek LocalStorage
  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F2]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#EADBCE] border-t-[#6B4423]"></div>
      </div>
    );
  }

  // TAMPILAN JIKA BELUM LOGIN (Login / Register) DENGAN NUANSA COKELAT WARM STUDIO
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EFE6] p-4 antialiased">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E8DFD8] bg-white p-7 shadow-xl shadow-[#5C3D2E]/5 sm:p-9">
          {/* Logo & Judul Mufana Studio */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#543310] text-[#F5EFE6] shadow-lg shadow-[#543310]/20">
              <span className="font-serif text-2xl font-black tracking-wider">M</span>
            </div>
            <h1 className="mt-4 font-serif text-2xl font-bold tracking-tight text-[#3E2723]">
              Mufana Studio
            </h1>
            <p className="mt-1 text-xs text-[#786D66]">
              Katalog &amp; Manajemen Stok Produk Eksklusif
            </p>
          </div>

          {/* Tab Masuk / Daftar */}
          <div className="mt-6 flex rounded-2xl bg-[#F5EFE6] p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                authMode === "login"
                  ? "bg-white text-[#543310] shadow-sm"
                  : "text-[#786D66] hover:text-[#3E2723]"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
              className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                authMode === "register"
                  ? "bg-white text-[#543310] shadow-sm"
                  : "text-[#786D66] hover:text-[#3E2723]"
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {/* Pesan Error Auth */}
          {authError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0 text-rose-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{authError}</span>
            </div>
          )}

          {/* Form Masuk */}
          {authMode === "login" ? (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masukkan username Anda"
                  value={authFormData.username}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Masukkan password"
                  value={authFormData.password}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-6 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#543310] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#543310]/20 transition-all hover:bg-[#3E2723] active:scale-[0.99] disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Masuk ke Studio</span>
                )}
              </button>
            </form>
          ) : (
            /* Form Daftar */
            <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={authFormData.nama}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, nama: e.target.value }))
                  }
                  className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: budi123"
                  value={authFormData.username}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Minimal 6 karakter"
                  value={authFormData.password}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Konfirmasi Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Ulangi password"
                  value={authFormData.konfirmasiPassword}
                  onChange={(e) =>
                    setAuthFormData((prev) => ({ ...prev, konfirmasiPassword: e.target.value }))
                  }
                  className="mt-1 block min-h-[44px] w-full rounded-xl border border-[#E8DFD8] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:border-[#74512D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#543310] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#543310]/20 transition-all hover:bg-[#3E2723] active:scale-[0.99] disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Mendaftarkan...</span>
                  </>
                ) : (
                  <span>Daftar Akun Baru</span>
                )}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-[#A89F91]">
            Mufana Studio &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    );
  }

  // TAMPILAN UTAMA SETELAH LOGIN - MUFANA STUDIO (WARM COFFEE & ARTISAN BROWN)
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#3E2723] antialiased">
      {/* Header Utama Mufana Studio */}
      <header className="sticky top-0 z-30 border-b border-[#EADBCE] bg-white/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#543310] text-[#F5EFE6] shadow-sm shadow-[#543310]/20">
              <span className="font-serif text-lg font-black tracking-wider">M</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold tracking-tight text-[#3E2723] sm:text-xl">
                  Mufana Studio
                </h1>
                <span className="rounded-md bg-[#F5EFE6] px-2 py-0.5 text-[10px] font-bold text-[#543310]">
                  Katalog
                </span>
              </div>
              <p className="text-[11px] text-[#8C7A6B] hidden sm:block">
                Koleksi &amp; Manajemen Stok Produk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Profil User */}
            <div className="hidden items-center gap-2 rounded-xl bg-[#F5EFE6] px-3 py-1.5 text-xs text-[#543310] md:flex border border-[#EADBCE]">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#543310] text-[10px] font-bold text-white">
                {currentUser.nama.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold">{currentUser.nama}</span>
            </div>

            {/* Tombol Tambah Barang */}
            <button
              onClick={openAddModal}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#543310] px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-[#543310]/20 transition-all hover:bg-[#3E2723] active:scale-[0.98] sm:min-h-[42px] sm:px-4 sm:text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 sm:h-5 sm:w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Tambah Produk</span>
            </button>

            {/* Tombol Logout */}
            <button
              onClick={handleLogout}
              title="Keluar dari akun"
              className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-[#EADBCE] bg-white px-3 py-2 text-xs font-semibold text-[#786D66] shadow-2xs transition hover:bg-rose-50 hover:text-rose-600 sm:min-h-[42px] sm:px-3.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Konten Halaman */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {/* Pesan Sukses */}
        {successMessage && (
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-800 shadow-2xs">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-emerald-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Pesan Error */}
        {errorMessage && (
          <div className="mb-5 flex items-start justify-between rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-800 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mt-0.5 h-5 w-5 shrink-0 text-rose-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="rounded-lg p-1 text-rose-600 hover:bg-rose-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Toolbar: Bar Pencarian, Toggle View & Info */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Kolom Pencarian */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-[#A89F91]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari koleksi produk studio..."
              className="block min-h-[44px] w-full rounded-2xl border border-[#EADBCE] bg-white py-2.5 pl-11 pr-9 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs transition-all focus:border-[#74512D] focus:outline-none focus:ring-2 focus:ring-[#74512D]/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#A89F91] hover:text-[#543310]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Opsi Tampilan & Statistik */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            {/* Toggle View: Katalog Grid vs Tabel */}
            <div className="flex rounded-xl bg-white p-1 border border-[#EADBCE] shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("katalog")}
                title="Tampilan Kartu Katalog"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  viewMode === "katalog"
                    ? "bg-[#543310] text-white shadow-2xs"
                    : "text-[#786D66] hover:text-[#3E2723]"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span>Katalog</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("tabel")}
                title="Tampilan Tabel"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  viewMode === "tabel"
                    ? "bg-[#543310] text-white shadow-2xs"
                    : "text-[#786D66] hover:text-[#3E2723]"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span>Tabel</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#8C7A6B]">
              <span className="font-semibold text-[#543310]">{filteredBarang.length} produk</span>
              {barangList.some((item) => item.stok <= 5) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                  Stok &le; 5
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Kondisi Loading */}
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-[#EADBCE] bg-white p-8 text-center shadow-2xs">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#EADBCE] border-t-[#543310]"></div>
            <p className="mt-4 text-sm font-medium text-[#786D66]">
              Memuat koleksi Mufana Studio...
            </p>
          </div>
        ) : filteredBarang.length === 0 ? (
          /* Kondisi Kosong */
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#D6C7B8] bg-white p-8 text-center shadow-2xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5EFE6] text-[#543310]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h3 className="mt-4 font-serif text-lg font-bold text-[#3E2723]">
              {searchQuery ? "Produk tidak ditemukan" : "Belum ada produk di koleksi"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-[#786D66]">
              {searchQuery
                ? `Tidak ada produk yang cocok dengan "${searchQuery}". Coba kata kunci lainnya.`
                : "Mulai tambahkan koleksi produk pertama Anda lengkap dengan foto, harga, dan stok."}
            </p>
            {!searchQuery && (
              <button
                onClick={openAddModal}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#543310] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#543310]/20 hover:bg-[#3E2723]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Tambah Produk Pertama
              </button>
            )}
          </div>
        ) : viewMode === "katalog" ? (
          /* TAMPILAN KATALOG KARTU EKSKLUSIF MUFANA STUDIO (Foto Besar, Nuansa Cokelat Premium) */
          <div className="grid grid-cols-2 gap-3.5 sm:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredBarang.map((item) => {
              const isLowStock = item.stok <= 5;
              return (
                <div
                  key={item.id}
                  className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                    isLowStock
                      ? "border-rose-200 ring-1 ring-rose-200"
                      : "border-[#EADBCE] hover:border-[#74512D]"
                  }`}
                >
                  {/* FOTO PRODUK STUDIO (ASPECT RATIO 1:1) */}
                  <div className="relative aspect-square w-full overflow-hidden bg-[#F5EFE6]">
                    {item.foto ? (
                      <img
                        src={item.foto}
                        alt={item.nama}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-4 text-[#A89F91]">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-10 w-10 sm:h-12 sm:w-12 text-[#D6C7B8]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="mt-1 text-[11px] font-medium text-[#A89F91]">
                          Studio Frame
                        </span>
                      </div>
                    )}

                    {/* BADGE STOK OVERLAY */}
                    {isLowStock ? (
                      <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white shadow-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse"></span>
                        <span>{item.stok === 0 ? "Habis" : `Sisa ${item.stok}`}</span>
                      </div>
                    ) : (
                      <div className="absolute right-2.5 top-2.5 rounded-md bg-[#3E2723]/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-[#F5EFE6] shadow-2xs">
                        Stok: {item.stok}
                      </div>
                    )}
                  </div>

                  {/* INFORMASI PRODUK STUDIO */}
                  <div className="flex flex-1 flex-col p-3.5">
                    {/* HARGA PRODUK - WARNA COKELAT HANGAT */}
                    <div className="text-base sm:text-lg font-bold tracking-tight text-[#6B4423]">
                      {formatRupiah(item.harga)}
                    </div>

                    {/* NAMA PRODUK */}
                    <h3
                      title={item.nama}
                      className="mt-1 line-clamp-2 min-h-[2.4rem] text-xs sm:text-sm font-semibold text-[#3E2723] transition group-hover:text-[#543310]"
                    >
                      {item.nama}
                    </h3>

                    {/* STATUS STOK */}
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#8C7A6B]">
                      <span>Ketersediaan:</span>
                      <span
                        className={`font-bold ${
                          isLowStock
                            ? "text-rose-600 font-extrabold"
                            : "text-[#543310]"
                        }`}
                      >
                        {item.stok} unit
                      </span>
                    </div>

                    {/* TOMBOL AKSI EDIT & HAPUS */}
                    <div className="mt-3.5 flex items-center gap-1.5 border-t border-[#F0E6DC] pt-2.5">
                      <button
                        onClick={() => openEditModal(item)}
                        className="flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-[#EADBCE] bg-[#FAF7F2] py-1.5 text-xs font-semibold text-[#543310] shadow-2xs hover:bg-[#F5EFE6] active:scale-[0.98]"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 text-[#786D66]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setDeletingItem(item)}
                        className="flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs hover:bg-rose-100/70 active:scale-[0.98]"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 text-rose-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* TAMPILAN TABEL STUDIO */
          <div className="overflow-hidden rounded-2xl border border-[#EADBCE] bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#786D66]">
                <thead className="border-b border-[#EADBCE] bg-[#FAF7F2] text-xs font-bold uppercase tracking-wider text-[#543310]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Foto
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Nama Produk
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Harga
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Stok
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5EFE6]">
                  {filteredBarang.map((item) => {
                    const isLowStock = item.stok <= 5;
                    return (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-[#FAF7F2]/80"
                      >
                        <td className="px-5 py-3">
                          {item.foto ? (
                            <img
                              src={item.foto}
                              alt={item.nama}
                              className="h-14 w-14 rounded-xl object-cover border border-[#EADBCE] shadow-2xs"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#F5EFE6] text-[#A89F91] border border-[#EADBCE]">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-[#3E2723]">
                            {item.nama}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-[#6B4423]">
                          {formatRupiah(item.harga)}
                        </td>
                        <td className="px-5 py-3.5">
                          {isLowStock ? (
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                              <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse"></span>
                              <span>{item.stok} (Menipis)</span>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-lg border border-[#EADBCE] bg-[#FAF7F2] px-2.5 py-1 text-xs font-semibold text-[#543310]">
                              {item.stok} unit
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(item)}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#EADBCE] bg-white px-3 py-1 text-xs font-semibold text-[#543310] shadow-2xs hover:bg-[#F5EFE6]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingItem(item)}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 shadow-2xs hover:bg-rose-100"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Tambah & Edit Barang */}
      {(isAddModalOpen || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3E2723]/50 p-4 backdrop-blur-xs sm:items-center">
          <div className="max-h-[92vh] overflow-y-auto w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl transition-all sm:p-8 border border-[#EADBCE]">
            <div className="flex items-center justify-between border-b border-[#F0E6DC] pb-4">
              <h2 className="font-serif text-lg font-bold text-[#3E2723]">
                {editingItem ? "Edit Data Produk" : "Tambah Produk Baru"}
              </h2>
              <button
                onClick={closeModal}
                disabled={actionLoading}
                className="rounded-lg p-1.5 text-[#A89F91] hover:bg-[#F5EFE6] hover:text-[#3E2723] disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={editingItem ? handleUpdate : handleCreate}
              className="mt-5 space-y-4"
            >
              {/* Field: Foto Barang */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Foto Produk
                </label>

                {formData.foto ? (
                  <div className="mt-2 flex items-center gap-4">
                    <img
                      src={formData.foto}
                      alt="Preview"
                      className="h-24 w-24 rounded-2xl object-cover border border-[#EADBCE] shadow-2xs"
                    />
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Hapus Foto
                      </button>
                      <p className="text-xs text-[#8C7A6B]">Klik untuk mengganti foto</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <label className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D6C7B8] bg-[#FAF7F2] p-4 text-center transition hover:border-[#74512D] hover:bg-[#F5EFE6]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-[#8C7A6B]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="mt-1 text-xs font-semibold text-[#543310]">
                        Pilih foto atau ambil gambar
                      </span>
                      <span className="text-[11px] text-[#A89F91]">
                        JPG, PNG, WebP (otomatis dikompresi)
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Field: Nama Produk */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kemeja Linen Vintage Brown"
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, nama: e.target.value }))
                  }
                  className={`mt-1.5 block min-h-[44px] w-full rounded-xl border bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:bg-white focus:outline-none focus:ring-2 ${
                    formErrors.nama
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-[#EADBCE] focus:border-[#74512D] focus:ring-[#74512D]/20"
                  }`}
                />
                {formErrors.nama && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.nama}</p>
                )}
              </div>

              {/* Field: Harga */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Harga Satuan (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-[#8C7A6B]">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="0"
                    value={formData.harga}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, harga: e.target.value }))
                    }
                    className={`block min-h-[44px] w-full rounded-xl border bg-[#FAF7F2] py-2.5 pl-11 pr-3.5 text-sm font-semibold text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:bg-white focus:outline-none focus:ring-2 ${
                      formErrors.harga
                        ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-[#EADBCE] focus:border-[#74512D] focus:ring-[#74512D]/20"
                    }`}
                  />
                </div>
                {formErrors.harga && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.harga}</p>
                )}
              </div>

              {/* Field: Stok */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#543310]">
                  Jumlah Stok <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="0"
                  value={formData.stok}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, stok: e.target.value }))
                  }
                  className={`mt-1.5 block min-h-[44px] w-full rounded-xl border bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#3E2723] placeholder-[#A89F91] shadow-2xs focus:bg-white focus:outline-none focus:ring-2 ${
                    formErrors.stok
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-[#EADBCE] focus:border-[#74512D] focus:ring-[#74512D]/20"
                  }`}
                />
                <p className="mt-1 text-xs text-[#8C7A6B]">
                  Tip: Stok 5 atau kurang akan otomatis ditandai dengan badge merah.
                </p>
                {formErrors.stok && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.stok}</p>
                )}
              </div>

              {/* Tombol Form */}
              <div className="mt-6 flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={actionLoading}
                  className="min-h-[44px] rounded-xl border border-[#EADBCE] bg-white px-5 py-2.5 text-sm font-semibold text-[#543310] shadow-2xs hover:bg-[#FAF7F2] disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#543310] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-[#543310]/20 hover:bg-[#3E2723] disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>{editingItem ? "Perbarui Produk" : "Simpan Produk"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3E2723]/50 p-4 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8 border border-[#EADBCE]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h2 className="mt-4 font-serif text-lg font-bold text-[#3E2723]">
              Hapus Produk dari Koleksi
            </h2>
            <p className="mt-2 text-sm text-[#786D66]">
              Apakah Anda yakin ingin menghapus{" "}
              <strong className="text-[#3E2723]">&ldquo;{deletingItem.nama}&rdquo;</strong>?
              Data yang sudah dihapus tidak dapat dikembalikan.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={actionLoading}
                className="min-h-[44px] rounded-xl border border-[#EADBCE] bg-white px-5 py-2.5 text-sm font-semibold text-[#543310] shadow-2xs hover:bg-[#FAF7F2] disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={actionLoading}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <span>Ya, Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
