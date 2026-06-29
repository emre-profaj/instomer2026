import re

with open('frontend/src/components/ContactSidebar/ContactSidebar.jsx', 'r') as f:
    content = f.read()

# 1. Update validation in handleAddActivity
content = content.replace(
    "if (activityForm.type === 'NOTE' && noteCallSuccess === null) {",
    "if (activityForm.type === 'NOTE' && noteCallSuccess === null) {\n            return alert('Lütfen aramanın durumunu (Başarılı / Başarısız / Ulaşılamadı) seçin.');\n        }\n        if (activityForm.type === 'NOTE' && noteCallSuccess !== 'UNREACHABLE' && !noteCallSentiment) {"
)
# remove the old sentiment validation
content = re.sub(
    r"if \(activityForm\.type === 'NOTE' && !noteCallSentiment\) \{\n            return alert\('Lütfen görüşme duygusunu \(Olumlu / Nötr / Olumsuz\) seçin\.'\);\n        \}",
    "",
    content
)

# 2. Update payload in handleAddActivity
content = content.replace(
    "description: activityForm.description,",
    "description: (isCallNote && noteCallSuccess === 'UNREACHABLE') ? `📵 Ulaşılamadı: ${activityForm.description}` : activityForm.description,"
)
content = content.replace(
    "...(isCallNote && noteCallSuccess !== null && { callSuccessful: noteCallSuccess }),",
    "...(isCallNote && noteCallSuccess !== null && { callSuccessful: noteCallSuccess === 'SUCCESS' }),"
)
content = content.replace(
    "...(isCallNote && noteCallSentiment && { callSentiment: noteCallSentiment }),",
    "...(isCallNote && noteCallSentiment && noteCallSuccess !== 'UNREACHABLE' && { callSentiment: noteCallSentiment }),"
)

# 3. Update validation in handleCompleteActivity
content = content.replace(
    "if (isCallType && completeCallSuccess === null) {",
    "if (isCallType && completeCallSuccess === null) {\n            return alert('Lütfen aramanın durumunu (Başarılı / Başarısız / Ulaşılamadı) seçin.');\n        }\n        if (isCallType && completeCallSuccess !== 'UNREACHABLE' && !completeCallSentiment) {"
)
content = re.sub(
    r"if \(isCallType && !completeCallSentiment\) \{\n            return alert\('Lütfen görüşme duygusunu \(Olumlu / Nötr / Olumsuz\) seçin\.'\);\n        \}",
    "",
    content
)

# 4. Update completeActivity call
content = content.replace(
    """            await activityAPI.completeActivity(
                rawId,
                completeResult,
                isCallType ? completeCallSuccess : undefined,
                isCallType ? completeCallSentiment : undefined
            );""",
    """            let finalResult = completeResult;
            if (isCallType && completeCallSuccess === 'UNREACHABLE') {
                finalResult = finalResult ? `📵 Ulaşılamadı: ${finalResult}` : '📵 Ulaşılamadı';
            }
            await activityAPI.completeActivity(
                rawId,
                finalResult,
                isCallType ? (completeCallSuccess === 'SUCCESS') : undefined,
                isCallType && completeCallSuccess !== 'UNREACHABLE' ? completeCallSentiment : undefined
            );"""
)

# 5. Update completedItem payload
content = content.replace(
    """                status: 'COMPLETED',
                content: completeResult || completingActivity.content,
                callSuccessful: isCallType ? completeCallSuccess : undefined,
                callSentiment: isCallType ? completeCallSentiment : undefined""",
    """                status: 'COMPLETED',
                content: finalResult || completingActivity.content,
                callSuccessful: isCallType ? (completeCallSuccess === 'SUCCESS') : undefined,
                callSentiment: isCallType && completeCallSuccess !== 'UNREACHABLE' ? completeCallSentiment : undefined"""
)

# 6. Replace UI buttons for noteCallSuccess
old_ui_buttons = """                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess(true)}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === true ? '#16a34a' : '#e5e7eb',
                                                                    background: noteCallSuccess === true ? '#dcfce7' : '#fff',
                                                                    color: noteCallSuccess === true ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Başarılı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Ulaşıldı, konuşuldu</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess(false)}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === false ? '#ef4444' : '#e5e7eb',
                                                                    background: noteCallSuccess === false ? '#fef2f2' : '#fff',
                                                                    color: noteCallSuccess === false ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Başarısız
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı / Kapattı</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    <div style={{ marginBottom: '12px' }}>"""

new_ui_buttons = """                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess('SUCCESS')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                                                    background: noteCallSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                                                    color: noteCallSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Başarılı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Ulaşıldı, konuşuldu</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess('FAILED')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                                                    background: noteCallSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                                                    color: noteCallSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Başarısız
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Konuştu, olumsuz</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess('UNREACHABLE')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === 'UNREACHABLE' ? '#f59e0b' : '#e5e7eb',
                                                                    background: noteCallSuccess === 'UNREACHABLE' ? '#fef3c7' : '#fff',
                                                                    color: noteCallSuccess === 'UNREACHABLE' ? '#b45309' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                📵 Ulaşılamadı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı / Meşgul</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    {noteCallSuccess !== 'UNREACHABLE' && (
                                                    <div style={{ marginBottom: '12px' }}>"""

content = content.replace(old_ui_buttons, new_ui_buttons)

# Now we need to close the curly brace for the noteCallSuccess sentiment block
# It ends right before: </>\n                                            )}\n                                            {activityForm.type !== 'NOTE' && (
content = content.replace(
    """                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}""",
    """                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    )}
                                                </>
                                            )}"""
)


# 7. Replace UI buttons for completeCallSuccess
old_complete_buttons = """                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess(true)}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === true ? '#16a34a' : '#e5e7eb',
                                                                    background: completeCallSuccess === true ? '#dcfce7' : '#fff',
                                                                    color: completeCallSuccess === true ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Başarılı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Ulaşıldı, konuşuldu</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess(false)}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === false ? '#ef4444' : '#e5e7eb',
                                                                    background: completeCallSuccess === false ? '#fef2f2' : '#fff',
                                                                    color: completeCallSuccess === false ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Başarısız
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı / Kapattı</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    <div style={{ marginBottom: '12px' }}>"""

new_complete_buttons = """                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess('SUCCESS')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                                                    background: completeCallSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                                                    color: completeCallSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Başarılı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Ulaşıldı, konuşuldu</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess('FAILED')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                                                    background: completeCallSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                                                    color: completeCallSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Başarısız
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Konuştu, olumsuz</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess('UNREACHABLE')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === 'UNREACHABLE' ? '#f59e0b' : '#e5e7eb',
                                                                    background: completeCallSuccess === 'UNREACHABLE' ? '#fef3c7' : '#fff',
                                                                    color: completeCallSuccess === 'UNREACHABLE' ? '#b45309' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                📵 Ulaşılamadı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı / Meşgul</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    {completeCallSuccess !== 'UNREACHABLE' && (
                                                    <div style={{ marginBottom: '12px' }}>"""

content = content.replace(old_complete_buttons, new_complete_buttons)

# Close the curly brace for completeCallSuccess sentiment
content = content.replace(
    """                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            <div className="reminder-form-group">""",
    """                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    )}
                                                </>
                                            )}

                                            <div className="reminder-form-group">"""
)

with open('frontend/src/components/ContactSidebar/ContactSidebar.jsx', 'w') as f:
    f.write(content)

