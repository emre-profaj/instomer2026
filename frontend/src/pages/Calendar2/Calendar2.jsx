import React, { useState, useEffect } from "react";
import {
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Phone,
  AlignLeft,
  Search,
  Plus,
  Filter,
  MoreHorizontal,
  Bot,
  X,
} from "lucide-react";
import ResourceSettings from "./ResourceSettings";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";

const Calendar2 = () => {
  const { currentWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState("calendar");
  const [viewType, setViewType] = useState("list");
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [showOnlyNewAI, setShowOnlyNewAI] = useState(false);

  const formatDate = (date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  const handleDrop = (e, targetDateStr) => {
    e.preventDefault();
    if (!draggedEvent) return;
    setEvents(events.map(ev => 
      ev.id === draggedEvent.id ? { ...ev, date: targetDateStr } : ev
    ));
    setDraggedEvent(null);
  };

  const handleSendWhatsAppTemplate = (e, phone, clientName) => {
    e.stopPropagation();
    alert(`[WhatsApp Şablonu Gönderiliyor]\nMüşteri: ${clientName}\nTelefon: ${phone}`);
    // whatsappAPI.sendTemplate(currentWorkspace?.id, { to: phone, ... })
  };

  const handleMakeRetellCall = (e, phone, clientName) => {
    e.stopPropagation();
    alert(`[Yapay Zeka Araması Başlatılıyor]\nMüşteri: ${clientName}\nTelefon: ${phone}\nRetell ajanı arıyor...`);
    // retellAPI.makeCall(currentWorkspace?.id, { to: phone, ... })
  };

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchBranches();
    }
  }, [currentWorkspace?.id]);

  const fetchBranches = async () => {
    try {
      const res = await api.get(
        `/appointment-config/${currentWorkspace.id}/branches`,
      );
      const fetchedBranches = res.data.branches || [];
      setBranches(fetchedBranches);
      if (fetchedBranches.length > 0 && !selectedBranchId) {
        setSelectedBranchId(fetchedBranches[0].id);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const activeBranch = branches.find((b) => b.id === selectedBranchId);
  const resources = activeBranch?.doctors || [];
  const filteredResources = selectedDoctorId
    ? resources.filter((r) => r.id === selectedDoctorId)
    : resources;

  // Hours to display (08:00 - 19:00)
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);

  const getStatusInfo = (status) => {
    switch (status) {
      case "confirmed": return { label: "Onaylandı", color: "#10b981", bg: "#d1fae5" };
      case "pending": return { label: "Bekliyor", color: "#f59e0b", bg: "#fef3c7" };
      case "completed": return { label: "Tamamlandı", color: "#64748b", bg: "#f1f5f9" };
      case "cancelled": return { label: "İptal Edildi", color: "#ef4444", bg: "#fee2e2" };
      default: return { label: "Bekliyor", color: "#f59e0b", bg: "#fef3c7" };
    }
  };

  useEffect(() => {
    if (resources.length > 0 && events.length === 0) {
      const curr = new Date(currentDate);
      const day = curr.getDay();
      const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(diff));
      const getDayStr = (offset) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + offset);
        return formatDate(d);
      };

      setEvents([
        {
          id: 1,
          resourceId: resources[0]?.id,
          date: getDayStr(0),
          title: "Müşteri Görüşmesi",
          client: "Emre Yılmaz",
          phone: "+90 532 123 45 67",
          startHour: 10,
          startMin: 30,
          duration: 60,
          color: "blue",
          desc: "İlk tanışma toplantısı ve genel bilgilendirme.",
          source: "human",
          status: "confirmed",
        },
        {
          id: 2,
          resourceId: resources[1]?.id || resources[0]?.id,
          date: getDayStr(1),
          title: "Kapsamlı İşlem",
          client: "Ayşe Demir",
          phone: "+90 555 987 65 43",
          startHour: 13,
          startMin: 0,
          duration: 120,
          color: "pink",
          desc: "2. Seans Kapsamlı Tüm Vücut İşlemi. Lütfen gecikmeyin.",
          source: "ai",
          status: "pending",
          isNew: true,
        },
        {
          id: 3,
          resourceId: resources[2]?.id || resources[0]?.id,
          date: getDayStr(2),
          title: "Kontrol",
          client: "Mehmet Kaya",
          phone: "+90 544 111 22 33",
          startHour: 15,
          startMin: 30,
          duration: 30,
          color: "emerald",
          desc: "Aylık rutin kontrol.",
          source: "human",
          status: "completed",
        },
        {
          id: 4,
          resourceId: resources[0]?.id,
          date: getDayStr(3),
          title: "Ameliyat Öncesi",
          client: "Canan Can",
          phone: "+90 533 222 11 00",
          startHour: 9,
          startMin: 0,
          duration: 180,
          color: "amber",
          desc: "Ameliyat öncesi testler.",
          source: "ai",
          status: "cancelled",
        },
      ]);
    }
  }, [resources, events.length]);

  // Haftanın günleri
  const weekDays = [
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi",
    "Pazar",
  ];

  const getColorTheme = (color) => {
    const themes = {
      blue: {
        bg: "#eff6ff",
        border: "#3b82f6",
        text: "#1e3a8a",
        subtext: "#60a5fa",
        gradient: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
      },
      pink: {
        bg: "#fdf2f8",
        border: "#ec4899",
        text: "#831843",
        subtext: "#f472b6",
        gradient: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
      },
      emerald: {
        bg: "#ecfdf5",
        border: "#10b981",
        text: "#064e3b",
        subtext: "#34d399",
        gradient: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
      },
      amber: {
        bg: "#fffbeb",
        border: "#f59e0b",
        text: "#78350f",
        subtext: "#fbbf24",
        gradient: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      },
    };
    return themes[color] || themes.blue;
  };

  const dayNames = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

  const getDaysList = () => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff));
    
    const days = [];
    for(let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div
      className="page-container"
      style={{
        padding: "24px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f8fafc",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>
        {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                
                .modern-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .modern-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .modern-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 20px;
                }
                .modern-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: #94a3b8;
                }
                
                .event-block {
                    position: absolute;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                }
                .event-block:hover {
                    transform: translateX(4px);
                    z-index: 50 !important;
                }
                
                .event-tooltip-content {
                    opacity: 0;
                    visibility: hidden;
                    position: absolute;
                    left: 30px;
                    top: 25px;
                    width: 260px;
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05);
                    padding: 16px;
                    z-index: 100;
                    transform: translateX(-10px);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    pointer-events: none;
                }
                
                .event-block:hover .event-tooltip-content {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(0);
                    pointer-events: auto;
                }
                .event-tooltip-content::after {
                    content: "";
                    position: absolute;
                    top: -20px;
                    left: -20px;
                    right: -20px;
                    bottom: -20px;
                    background: transparent;
                    z-index: -1;
                }
                
                .appointment-pill {
                    position: relative;
                    overflow: visible !important;
                }
                .calendar-day {
                    overflow: visible !important;
                    position: relative;
                }
                .calendar-day:hover {
                    z-index: 50;
                }
                .day-appointments {
                    overflow: visible !important;
                    position: relative;
                }
                .appointment-pill:hover {
                    z-index: 100;
                }
                .appointment-pill .event-tooltip-content {
                    opacity: 0;
                    visibility: hidden;
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%) translateY(10px);
                    margin-bottom: 8px;
                    width: 260px;
                    height: auto !important;
                    min-height: max-content;
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05);
                    padding: 16px;
                    z-index: 9999;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    pointer-events: none;
                    text-align: left;
                    color: initial;
                    display: flex;
                    flex-direction: column;
                    white-space: normal !important;
                }
                .appointment-pill:hover .event-tooltip-content {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0);
                    pointer-events: auto;
                }
                
                .calendar-day:nth-child(7n+1) .appointment-pill .event-tooltip-content,
                .calendar-day:nth-child(7n+2) .appointment-pill .event-tooltip-content {
                    left: 0;
                    transform: translateY(10px);
                }
                .calendar-day:nth-child(7n+1) .appointment-pill:hover .event-tooltip-content,
                .calendar-day:nth-child(7n+2) .appointment-pill:hover .event-tooltip-content {
                    transform: translateY(0);
                }

                .calendar-day:nth-child(7n+6) .appointment-pill .event-tooltip-content,
                .calendar-day:nth-child(7n) .appointment-pill .event-tooltip-content {
                    left: auto;
                    right: 0;
                    transform: translateY(10px);
                }
                .calendar-day:nth-child(7n+6) .appointment-pill:hover .event-tooltip-content,
                .calendar-day:nth-child(7n) .appointment-pill:hover .event-tooltip-content {
                    transform: translateY(0);
                }

                .grid-cell {
                    border-bottom: 1px dashed #e2e8f0;
                    border-right: 1px solid #f1f5f9;
                    position: relative;
                    transition: background-color 0.2s;
                }
                .grid-cell:hover {
                    background-color: #f8fafc;
                }
                
                .time-cell {
                    border-bottom: 1px dashed #e2e8f0;
                    border-right: 1px solid #e2e8f0;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                    border: none;
                    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
                }
                .btn-primary:hover {
                    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                    box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.4);
                }
                
                .avatar-placeholder {
                    background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
                    color: #475569;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    border-radius: 50%;
                }
                `}
      </style>

      {/* Header Area */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: "4px" }}>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: "#0f172a",
                letterSpacing: "-0.5px",
                margin: 0,
              }}
            >
              Rezervasyon
            </h1>
          </div>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
            Personel ve kaynaklara göre randevu planlaması yapın.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            background: "#ffffff",
            padding: "6px",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <button
            onClick={() => setActiveTab("calendar")}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: activeTab === "calendar" ? "#f1f5f9" : "transparent",
              color: activeTab === "calendar" ? "#0f172a" : "#64748b",
              border: "none",
              cursor: "pointer",
              fontWeight: activeTab === "calendar" ? "600" : "500",
              transition: "all 0.2s",
              boxShadow:
                activeTab === "calendar"
                  ? "0 1px 2px rgba(0,0,0,0.05)"
                  : "none",
            }}
          >
            <Calendar
              size={18}
              strokeWidth={activeTab === "calendar" ? 2.5 : 2}
            />
            Planlama Görünümü
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: activeTab === "settings" ? "#f1f5f9" : "transparent",
              color: activeTab === "settings" ? "#0f172a" : "#64748b",
              border: "none",
              cursor: "pointer",
              fontWeight: activeTab === "settings" ? "600" : "500",
              transition: "all 0.2s",
              boxShadow:
                activeTab === "settings"
                  ? "0 1px 2px rgba(0,0,0,0.05)"
                  : "none",
            }}
          >
            <Settings
              size={18}
              strokeWidth={activeTab === "settings" ? 2.5 : 2}
            />
            Kaynak Yönetimi
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div
        style={{
          flex: 1,
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.02)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e2e8f0",
        }}
      >
        {activeTab === "calendar" && (
          <div
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            {/* Calendar Toolbar */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "24px" }}
              >
                {/* Date Navigation */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    padding: "4px",
                  }}
                >
                  <button
                    onClick={handlePrevDay}
                    style={{
                      padding: "8px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      borderRadius: "6px",
                      color: "#64748b",
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span
                    style={{
                      padding: "0 16px",
                      fontWeight: "600",
                      color: "#0f172a",
                      minWidth: "150px",
                      textAlign: "center",
                      fontSize: "15px",
                    }}
                  >
                    {currentDate.toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      weekday: "short",
                    })}
                  </span>
                  <button
                    onClick={handleNextDay}
                    style={{
                      padding: "8px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      borderRadius: "6px",
                      color: "#64748b",
                    }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {/* Branch Filter */}
                <div style={{ position: "relative" }}>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    style={{
                      appearance: "none",
                      padding: "10px 40px 10px 16px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      outline: "none",
                      cursor: "pointer",
                      fontWeight: "500",
                      minWidth: "220px",
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontSize: "14px",
                    }}
                  >
                    {branches.length === 0 && (
                      <option value="">Departman Yok</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <div
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "#64748b",
                    }}
                  >
                    <Filter size={16} />
                  </div>
                </div>

                {/* Doctor Filter */}
                <div style={{ position: "relative" }}>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    style={{
                      appearance: "none",
                      padding: "10px 40px 10px 16px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      outline: "none",
                      cursor: "pointer",
                      fontWeight: "500",
                      minWidth: "180px",
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontSize: "14px",
                    }}
                  >
                    <option value="">Tüm Personeller</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <div
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "#64748b",
                    }}
                  >
                    <User size={16} />
                  </div>
                </div>

                {/* Source Filter */}
                <div style={{ position: "relative" }}>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    style={{
                      appearance: "none",
                      padding: "10px 40px 10px 16px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      outline: "none",
                      cursor: "pointer",
                      fontWeight: "500",
                      minWidth: "160px",
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontSize: "14px",
                    }}
                  >
                    <option value="">Tüm Kaynaklar</option>
                    <option value="human">Personel (Manuel)</option>
                    <option value="ai">Yapay Zeka (AI)</option>
                  </select>
                  <div
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "#64748b",
                    }}
                  >
                    {selectedSource === "ai" ? <Bot size={16} /> : <User size={16} />}
                  </div>
                </div>
                
                {/* Unreviewed AI Filter */}
                <button
                  onClick={() => setShowOnlyNewAI(!showOnlyNewAI)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
                    background: showOnlyNewAI ? '#fee2e2' : '#f8fafc',
                    border: showOnlyNewAI ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                    color: showOnlyNewAI ? '#ef4444' : '#64748b',
                    fontWeight: '600', fontSize: '13px', transition: 'all 0.2s'
                  }}
                >
                  <Bot size={16} />
                  Sadece İncelenmemiş AI
                </button>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                  <button
                    onClick={() => setViewType('month')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: viewType === 'month' ? '#fff' : 'transparent',
                      boxShadow: viewType === 'month' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      color: viewType === 'month' ? '#0f172a' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                  >
                    Ay
                  </button>
                  <button
                    onClick={() => setViewType('list')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: viewType === 'list' ? '#fff' : 'transparent',
                      boxShadow: viewType === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      color: viewType === 'list' ? '#0f172a' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                  >
                    Haftalık Liste
                  </button>
                </div>
                <button
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    color: "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Search size={18} />
                </button>
                <button
                  className="btn-primary"
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                  onClick={() => {
                    setSelectedEvent({
                      id: Date.now(),
                      client: "",
                      phone: "",
                      startHour: 9,
                      startMin: 0,
                      duration: 30,
                      title: "",
                      source: "human",
                      color: "blue",
                      status: "pending",
                      resourceId: selectedDoctorId || (resources[0] ? resources[0].id : null),
                      date: formatDate(new Date())
                    });
                    setIsEditModalOpen(true);
                  }}
                >
                  <Plus size={18} /> Yeni Randevu
                </button>
              </div>
            </div>

            {/* Calendar Grid Area */}
            <div
              className="modern-scrollbar"
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: "#fafafa",
                padding: "24px",
              }}
            >
              {resources.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "#94a3b8",
                    flexDirection: "column",
                    gap: "16px",
                    background: "#ffffff",
                    borderRadius: "16px",
                    border: "1px solid #f1f5f9",
                  }}
                >
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: "24px",
                      borderRadius: "50%",
                    }}
                  >
                    <Calendar size={48} color="#cbd5e1" strokeWidth={1.5} />
                  </div>
                  <p
                    style={{
                      fontSize: "16px",
                      fontWeight: "500",
                      color: "#64748b",
                    }}
                  >
                    Bu departmanda henüz personel bulunmuyor.
                  </p>
                  <button
                    onClick={() => setActiveTab("settings")}
                    style={{
                      padding: "10px 20px",
                      background: "#3b82f6",
                      border: "none",
                      borderRadius: "8px",
                      color: "#ffffff",
                      fontWeight: "500",
                      cursor: "pointer",
                      boxShadow: "0 2px 4px rgba(59,130,246,0.3)",
                    }}
                  >
                    Kaynak Ekle
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: "min-content",
                    background: "#ffffff",
                    borderRadius: "16px",
                    border: "1px solid #f1f5f9",
                    padding: viewType === 'list' ? '12px' : '20px',
                    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    overflowX: "auto"
                  }}
                >
                  {viewType === 'list' ? (
                    <div className="modern-scrollbar" style={{ flex: 1, display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                      {getDaysList().map((day, index) => {
                        const targetDateStr = formatDate(day);
                        const dayEvents = events
                          .filter((apt) => !selectedDoctorId || apt.resourceId === selectedDoctorId)
                          .filter((apt) => !selectedSource || apt.source === selectedSource)
                          .filter((apt) => !showOnlyNewAI || (apt.source === 'ai' && apt.status === 'pending'))
                          .filter((apt) => apt.date === targetDateStr);
                        
                        return (
                          <div 
                            key={index} 
                            style={{ flex: '1', minWidth: '160px', display: 'flex', flexDirection: 'column', background: isToday(day) ? '#f8fafc' : '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, targetDateStr)}
                          >
                            <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>{dayNames[day.getDay()]}</div>
                                <div style={{ fontSize: '20px', color: isToday(day) ? '#2563eb' : '#0f172a', fontWeight: '700' }}>
                                  {day.getDate()} <span style={{ fontSize: '14px', fontWeight: '500' }}>{day.toLocaleString('tr-TR', {month:'short'})}</span>
                                </div>
                              </div>
                              {dayEvents.length > 0 && (
                                <div style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '600', padding: '4px 8px', borderRadius: '12px' }}>
                                  {dayEvents.length} Randevu
                                </div>
                              )}
                            </div>
                            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 250px)' }} className="modern-scrollbar">
                               {dayEvents.map((apt, aptIdx) => {
                                 const theme = getColorTheme(apt.color);
                                 return (
                                   <div key={apt.id + '-' + aptIdx} style={{ 
                                     background: theme.bg, 
                                     borderRadius: '10px',
                                     padding: '14px',
                                     position: 'relative',
                                     overflow: 'hidden',
                                     cursor: 'grab',
                                     border: `1px solid ${theme.border}40`,
                                     boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                     transition: 'transform 0.2s',
                                   }}
                                   draggable={true}
                                   onDragStart={(e) => {
                                      setDraggedEvent(apt);
                                      e.dataTransfer.effectAllowed = "move";
                                   }}
                                   onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                   onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                   onClick={() => {
                                     setSelectedEvent(apt);
                                     setIsEditModalOpen(true);
                                   }}
                                   >
                                     <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: theme.border }}></div>
                                     
                                     {/* Header (Badges & Icons) */}
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                           {apt.status && (
                                             <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: getStatusInfo(apt.status).bg, color: getStatusInfo(apt.status).color }}>
                                               {getStatusInfo(apt.status).label}
                                             </span>
                                           )}
                                           {apt.isNew && (
                                              <span style={{ fontSize: '9px', fontWeight: '800', color: '#fff', background: '#ef4444', padding: '2px 6px', borderRadius: '10px', animation: 'pulse-red 2s infinite' }}>YENİ</span>
                                           )}
                                         </div>
                                       </div>
                                       {apt.source === 'ai' ? <Bot size={15} color="#8b5cf6" title="AI Tarafından Verildi" /> : <User size={15} color="#94a3b8" title="Personel Tarafından Verildi" />}
                                     </div>

                                     {/* Triage Buttons for Pending AI Appointments */}
                                     {apt.source === 'ai' && apt.status === 'pending' && (
                                       <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEvents(events.map(ev => ev.id === apt.id ? { ...ev, status: 'confirmed', isNew: false } : ev));
                                            }}
                                            style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: '600', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                            ✓ Onayla
                                          </button>
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEvents(events.map(ev => ev.id === apt.id ? { ...ev, status: 'cancelled', isNew: false } : ev));
                                            }}
                                            style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: '600', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                            ✕ İptal
                                          </button>
                                       </div>
                                     )}

                                     <div style={{ fontSize: '12px', color: theme.text, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                        <Clock size={12} strokeWidth={2.5} />
                                        {apt.startHour.toString().padStart(2, "0")}:{apt.startMin.toString().padStart(2, "0")} ({apt.duration} dk)
                                     </div>
                                     <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>
                                       {apt.client}
                                     </div>
                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
                                       <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                         <Phone size={12}/> {apt.phone}
                                       </div>
                                       {apt.phone && (
                                         <div style={{ display: 'flex', gap: '4px' }}>
                                           <button 
                                             onClick={(e) => handleSendWhatsAppTemplate(e, apt.phone, apt.client)}
                                             style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#25D366', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                             title="WhatsApp Şablonu Gönder"
                                           >
                                             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                             WhatsApp
                                           </button>
                                           <button 
                                             onClick={(e) => handleMakeRetellCall(e, apt.phone, apt.client)}
                                             style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#3b82f6', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                             title="Yapay Zeka Araması Başlat"
                                           >
                                             <Phone size={12}/> Ara
                                           </button>
                                         </div>
                                       )}
                                     </div>
                                     <div style={{ fontSize: '13px', color: theme.text, marginTop: '8px', opacity: 0.9, lineHeight: 1.4, borderTop: `1px solid ${theme.border}20`, paddingTop: '8px' }}>{apt.title}</div>
                                   </div>
                                 )
                               })}
                               {dayEvents.length === 0 && (
                                 <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px 0', fontStyle: 'italic' }}>
                                   Randevu yok
                                 </div>
                               )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : viewType === 'day' ? (
                    <div className="modern-scrollbar" style={{ flex: 1, overflowY: 'auto', position: 'relative', paddingRight: '12px' }}>
                      <div style={{ position: 'relative', minHeight: '800px', display: 'flex' }}>
                        {/* Time labels column */}
                        <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid #e2e8f0', position: 'relative' }}>
                          {Array.from({ length: 12 }).map((_, i) => {
                            const hour = i + 8;
                            return (
                              <div key={hour} style={{ position: 'absolute', top: `${i * 60}px`, width: '100%', textAlign: 'right', paddingRight: '8px', color: '#64748b', fontSize: '12px', fontWeight: '500', transform: 'translateY(-50%)' }}>
                                {hour.toString().padStart(2, '0')}:00
                              </div>
                            )
                          })}
                        </div>
                        {/* Grid & Events column */}
                        <div style={{ flex: 1, position: 'relative' }}>
                          {/* Grid lines */}
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} style={{ position: 'absolute', top: `${i * 60}px`, left: 0, right: 0, height: '1px', background: '#e2e8f0' }}></div>
                          ))}
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={`half-${i}`} style={{ position: 'absolute', top: `${i * 60 + 30}px`, left: 0, right: 0, height: '1px', background: '#f1f5f9', borderTop: '1px dashed #e2e8f0' }}></div>
                          ))}
                          
                          {/* Events */}
                          {events
                            .filter((apt) => !selectedDoctorId || apt.resourceId === selectedDoctorId)
                            .filter((apt) => !selectedSource || apt.source === selectedSource)
                            .filter((apt) => !showOnlyNewAI || (apt.source === 'ai' && apt.status === 'pending'))
                            .filter((apt) => apt.date === formatDate(currentDate))
                            .map((apt, idx) => {
                              const top = ((apt.startHour - 8) * 60) + apt.startMin;
                              const height = apt.duration;
                              const theme = getColorTheme(apt.color);
                              
                              if (top < 0) return null; // Outside of 08:00 - 19:00

                              return (
                                <div key={apt.id + '-' + idx} style={{ 
                                  position: 'absolute', 
                                  top: `${top}px`, 
                                  height: `${height}px`,
                                  left: '8px',
                                  right: '8px',
                                  background: theme.bg, 
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  border: `1px solid ${theme.border}40`,
                                  borderLeft: `4px solid ${theme.border}`,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                  transition: 'transform 0.2s',
                                  zIndex: 1,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'flex-start'
                                }}
                                onClick={() => {
                                  setSelectedEvent(apt);
                                  setIsEditModalOpen(true);
                                }}
                                >
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                     {apt.status && (
                                       <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: getStatusInfo(apt.status).bg, color: getStatusInfo(apt.status).color }}>
                                         {getStatusInfo(apt.status).label}
                                       </span>
                                     )}
                                     {apt.isNew && (
                                        <span style={{ fontSize: '9px', fontWeight: '800', color: '#fff', background: '#ef4444', padding: '2px 6px', borderRadius: '10px', animation: 'pulse-red 2s infinite' }}>YENİ</span>
                                     )}
                                   </div>
                                   {apt.source === 'ai' ? <Bot size={14} color="#8b5cf6" title="AI Tarafından Verildi" /> : <User size={14} color="#94a3b8" title="Personel Tarafından Verildi" />}
                                 </div>
                                 <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>
                                   {apt.client}
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
                                   <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                     <Phone size={12}/> {apt.phone}
                                   </div>
                                   {apt.phone && (
                                     <div style={{ display: 'flex', gap: '4px' }}>
                                       <button 
                                         onClick={(e) => handleSendWhatsAppTemplate(e, apt.phone, apt.client)}
                                         style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#25D366', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                                         title="WhatsApp Şablonu Gönder"
                                       >
                                         <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                         WhatsApp
                                       </button>
                                       <button 
                                         onClick={(e) => handleMakeRetellCall(e, apt.phone, apt.client)}
                                         style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: '#3b82f6', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '500' }}
                                         title="Yapay Zeka Araması Başlat"
                                       >
                                         <Phone size={10}/> Ara
                                       </button>
                                     </div>
                                   )}
                                 </div>
                                 <div style={{ fontSize: '12px', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={12} strokeWidth={2.5} />
                                    {apt.startHour.toString().padStart(2, "0")}:{apt.startMin.toString().padStart(2, "0")} ({apt.duration} dk) - {apt.title}
                                 </div>
                                </div>
                              )
                            })
                          }
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="calendar-grid"
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div className="calendar-weekdays">
                        {dayNames.map((day) => (
                          <div key={day} className="weekday">
                            {day}
                          </div>
                        ))}
                      </div>
                      <div
                        className="calendar-days"
                        style={{ flex: 1, overflowY: "auto" }}
                      >
                        {getDaysInMonth().map((day, index) => {
                          const targetDateStr = formatDate(day.date);
                          return (
                          <div
                            key={index}
                            className={`calendar-day ${!day.isCurrentMonth ? "other-month" : ""} ${isToday(day.date) ? "today" : ""}`}
                            style={{ minHeight: "120px" }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, targetDateStr)}
                          >
                            <span className="day-number">
                              {day.date.getDate()}
                            </span>
                            <div className="day-appointments">
                              {/* Events */}
                              {events
                                .filter(
                                  (apt) =>
                                    !selectedDoctorId ||
                                    apt.resourceId === selectedDoctorId,
                                )
                                .filter((apt) => !selectedSource || apt.source === selectedSource)
                                .filter((apt) => !showOnlyNewAI || (apt.source === 'ai' && apt.status === 'pending'))
                                .filter((apt) => apt.date === targetDateStr)
                                .map((apt) => {
                                  return (
                                  <div
                                    key={apt.id + '-' + index}
                                    className="appointment-pill"
                                    style={{
                                      backgroundColor: getColorTheme(apt.color).border,
                                      cursor: "grab",
                                      border: 'none'
                                    }}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      setDraggedEvent(apt);
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onClick={() => {
                                      setSelectedEvent(apt);
                                      setIsEditModalOpen(true);
                                    }}
                                  >
                                    <span className="apt-time">
                                      {apt.startHour.toString().padStart(2, "0")}:
                                      {apt.startMin.toString().padStart(2, "0")}
                                    </span>
                                    <span className="apt-title">
                                      {apt.client}
                                    </span>
                                    <div className="event-tooltip-content" onClick={(e) => e.stopPropagation()}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {apt.status && (
                                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: getStatusInfo(apt.status).bg, color: getStatusInfo(apt.status).color }}>
                                                {getStatusInfo(apt.status).label}
                                              </span>
                                            )}
                                            {apt.isNew && (
                                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#fff', background: '#ef4444', padding: '2px 6px', borderRadius: '10px', animation: 'pulse-red 2s infinite' }}>YENİ</span>
                                            )}
                                          </div>
                                        </div>
                                        {apt.source === 'ai' ? <Bot size={14} color="#8b5cf6" /> : <User size={14} color="#94a3b8" />}
                                      </div>

                                      {/* Triage Buttons for Pending AI Appointments */}
                                      {apt.source === 'ai' && apt.status === 'pending' && (
                                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                           <button 
                                             onClick={(e) => {
                                               e.stopPropagation();
                                               setEvents(events.map(ev => ev.id === apt.id ? { ...ev, status: 'confirmed', isNew: false } : ev));
                                             }}
                                             style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: '600', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                             ✓ Onayla
                                           </button>
                                           <button 
                                             onClick={(e) => {
                                               e.stopPropagation();
                                               setEvents(events.map(ev => ev.id === apt.id ? { ...ev, status: 'cancelled', isNew: false } : ev));
                                             }}
                                             style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: '600', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                             ✕ İptal
                                           </button>
                                        </div>
                                      )}

                                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                                        <Clock size={12} />
                                        {apt.startHour.toString().padStart(2, "0")}:{apt.startMin.toString().padStart(2, "0")} ({apt.duration} dk)
                                      </div>
                                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px', whiteSpace: 'normal', lineHeight: 1.2 }}>
                                        {apt.client}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'normal', fontWeight: 'normal' }}>
                                          <Phone size={12}/> {apt.phone}
                                        </div>
                                        {apt.phone && (
                                          <div style={{ display: 'flex', gap: '4px' }}>
                                            <button 
                                              onClick={(e) => handleSendWhatsAppTemplate(e, apt.phone, apt.client)}
                                              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#25D366', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                              title="WhatsApp Şablonu Gönder"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                              WhatsApp
                                            </button>
                                            <button 
                                              onClick={(e) => handleMakeRetellCall(e, apt.phone, apt.client)}
                                              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#3b82f6', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                              title="Yapay Zeka Araması Başlat"
                                            >
                                              <Phone size={12}/> Ara
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.4, borderTop: '1px solid #e2e8f0', paddingTop: '8px', whiteSpace: 'normal', fontWeight: 'normal' }}>
                                        {apt.title}
                                      </div>
                                    </div>
                                  </div>
                                 )})}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === "settings" && <ResourceSettings />}
      </div>

      {/* Edit Appointment Modal */}
      {isEditModalOpen && selectedEvent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
          }}
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#0f172a", margin: 0 }}>
                {events.find(ev => ev.id === selectedEvent?.id) ? "Randevu Düzenle" : "Yeni Randevu Ekle"}
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Müşteri Adı</label>
                  <input
                    type="text"
                    value={selectedEvent.client}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, client: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Telefon</label>
                  <input
                    type="text"
                    value={selectedEvent.phone}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, phone: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Başlangıç Saati</label>
                  <select
                    value={`${selectedEvent.startHour?.toString().padStart(2, '0')}:${selectedEvent.startMin?.toString().padStart(2, '0')}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':');
                      setSelectedEvent({ ...selectedEvent, startHour: parseInt(h), startMin: parseInt(m) });
                    }}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", backgroundColor: "#ffffff" }}
                  >
                    {Array.from({ length: 14 * 4 }).map((_, i) => {
                      const h = Math.floor(i / 4) + 8;
                      const m = (i % 4) * 15;
                      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                      return <option key={timeStr} value={timeStr}>{timeStr}</option>;
                    })}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Süre (dk)</label>
                  <input
                    type="number"
                    value={selectedEvent.duration}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, duration: parseInt(e.target.value) || 0 })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Konu / Açıklama</label>
                <textarea
                  value={selectedEvent.title}
                  onChange={(e) => setSelectedEvent({ ...selectedEvent, title: e.target.value })}
                  rows={2}
                  style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", resize: "none" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Oluşturan (Kaynak)</label>
                  <select
                    value={selectedEvent.source}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, source: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", backgroundColor: "#f8fafc" }}
                  >
                    <option value="human">Personel (Manuel)</option>
                    <option value="ai">Yapay Zeka (AI)</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Atanan Personel</label>
                  <select
                    value={selectedEvent.resourceId || ""}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, resourceId: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", backgroundColor: "#f8fafc" }}
                  >
                    {resources.map(res => (
                      <option key={res.id} value={res.id}>{res.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Tarih</label>
                  <input
                    type="date"
                    value={selectedEvent.date || formatDate(new Date())}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, date: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", backgroundColor: "#f8fafc" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "500", color: "#64748b" }}>Durum</label>
                  <select
                    value={selectedEvent.status || "pending"}
                    onChange={(e) => setSelectedEvent({ ...selectedEvent, status: e.target.value })}
                    style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "14px", color: "#0f172a", backgroundColor: "#f8fafc" }}
                  >
                    <option value="pending">Bekliyor</option>
                    <option value="confirmed">Onaylandı</option>
                    <option value="completed">Tamamlandı</option>
                    <option value="cancelled">İptal Edildi</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                {events.find(ev => ev.id === selectedEvent?.id) && (
                  <button
                    onClick={() => {
                      if (window.confirm("Bu randevuyu silmek istediğinize emin misiniz?")) {
                        setEvents(events.filter(ev => ev.id !== selectedEvent.id));
                        setIsEditModalOpen(false);
                      }
                    }}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "none", backgroundColor: "#fee2e2", color: "#dc2626", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    Sil
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#0f172a", fontWeight: "500", cursor: "pointer" }}
                >
                  İptal
                </button>
                <button
                  onClick={() => {
                    const exists = events.find(ev => ev.id === selectedEvent.id);
                    if (exists) {
                      setEvents(events.map(ev => ev.id === selectedEvent.id ? selectedEvent : ev));
                    } else {
                      setEvents([...events, selectedEvent]);
                    }
                    setIsEditModalOpen(false);
                  }}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontWeight: "500", cursor: "pointer", boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)" }}
                >
                  {events.find(ev => ev.id === selectedEvent?.id) ? "Değişiklikleri Kaydet" : "Randevu Oluştur"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar2;
