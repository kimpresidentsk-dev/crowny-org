// business.js v1.0 — 비즈니스 + 펀드레이즈 페이지
(function() {
    'use strict';

    // ===== BUSINESS =====
    window.loadBusinesses = async function() {
        const list = document.getElementById('business-list');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로딩 중...</p>';

        try {
            const snap = await db.collection('businesses').orderBy('createdAt', 'desc').get();
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--accent);">
                        <div style="font-size:3rem;margin-bottom:1rem;">🏢</div>
                        <p style="font-size:1rem;margin-bottom:0.5rem;">등록된 사업체가 없습니다</p>
                        <p style="font-size:0.8rem;">관리자가 사업체를 등록하면 여기에 표시됩니다</p>
                    </div>`;
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;padding:1.2rem;cursor:pointer;transition:transform 0.2s;';
                card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
                card.onmouseleave = () => card.style.transform = '';
                card.innerHTML = `
                    <div style="display:flex;gap:1rem;align-items:center;">
                        <div style="font-size:2.5rem;flex-shrink:0;">${d.emoji || '<i data-lucide="building-2"></i>'}</div>
                        <div style="flex:1;min-width:0;">
                            <strong style="display:block;font-size:1rem;">${d.name || '사업체'}</strong>
                            <p style="font-size:0.8rem;color:var(--accent);margin:0.2rem 0;">${d.category || ''} · ${d.country || ''}</p>
                            <p style="font-size:0.75rem;color:var(--text-muted,#6B5744);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.description || ''}</p>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            ${d.investmentGoal ? `<p style="font-size:0.7rem;color:var(--accent);">목표</p><strong style="font-size:0.9rem;">${Number(d.investmentGoal).toLocaleString()} CRTD</strong>` : ''}
                        </div>
                    </div>
                    ${d.investmentGoal && d.investmentCurrent ? `
                    <div style="margin-top:0.8rem;background:var(--bg,#0a0a1a);border-radius:4px;height:6px;overflow:hidden;">
                        <div style="height:100%;background:var(--gold,#8B6914);width:${Math.min(100, (d.investmentCurrent/d.investmentGoal)*100)}%;border-radius:4px;"></div>
                    </div>
                    <p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">${Math.round((d.investmentCurrent/d.investmentGoal)*100)}% 달성</p>` : ''}`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[business] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">로드 실패: ${e.message}</p>`;
        }
    };

    // ===== FUNDRAISE =====
    window.loadCampaigns = async function() {
        const list = document.getElementById('fund-campaigns');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--accent);">로딩 중...</p>';

        const interestFilter = document.getElementById('fund-filter-interest')?.value || 'all';
        const countryFilter = document.getElementById('fund-filter-country')?.value || 'all';

        try {
            let query = db.collection('campaigns').orderBy('createdAt', 'desc');
            if (interestFilter !== 'all' && interestFilter !== 'best') {
                query = query.where('category', '==', interestFilter);
            }
            const snap = await query.limit(30).get();
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--accent);">
                        <div style="font-size:3rem;margin-bottom:1rem;"><i data-lucide="heart"></i></div>
                        <p style="font-size:1rem;margin-bottom:0.5rem;">진행 중인 캠페인이 없습니다</p>
                        <p style="font-size:0.8rem;">새 캠페인을 만들어보세요!</p>
                    </div>`;
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                if (countryFilter !== 'all' && d.country !== countryFilter) return;

                const progress = d.goal ? Math.min(100, Math.round((d.raised || 0) / d.goal * 100)) : 0;
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-card,#3D2B1F);border:1px solid var(--border,#E8E0D8);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform 0.2s;';
                card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
                card.onmouseleave = () => card.style.transform = '';
                card.onclick = () => showCampaignDetail(doc.id, d);
                card.innerHTML = `
                    ${d.imageURL ? `<img src="${d.imageURL}" style="width:100%;height:180px;object-fit:cover;">` : `<div style="height:120px;background:linear-gradient(135deg,#3D2B1F,#6B5744);display:flex;align-items:center;justify-content:center;font-size:3rem;">${d.emoji || '<i data-lucide="heart"></i>'}</div>`}
                    <div style="padding:1rem;">
                        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                            ${d.category ? `<span style="font-size:0.65rem;padding:0.15rem 0.5rem;background:var(--bg);border-radius:10px;">${d.category}</span>` : ''}
                            ${d.country ? `<span style="font-size:0.65rem;padding:0.15rem 0.5rem;background:var(--bg);border-radius:10px;">${d.country}</span>` : ''}
                        </div>
                        <strong style="display:block;font-size:0.95rem;margin-bottom:0.5rem;">${d.title || '캠페인'}</strong>
                        <p style="font-size:0.8rem;color:var(--text-muted,#6B5744);margin-bottom:0.8rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${d.description || ''}</p>
                        <div style="background:var(--bg,#0a0a1a);border-radius:4px;height:8px;overflow:hidden;margin-bottom:0.5rem;">
                            <div style="height:100%;background:${progress >= 100 ? '#6B8F3C' : 'var(--gold,#8B6914)'};width:${progress}%;border-radius:4px;transition:width 0.3s;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.75rem;">
                            <span>${(d.raised || 0).toLocaleString()} / ${(d.goal || 0).toLocaleString()} CRTD</span>
                            <strong style="color:var(--gold,#8B6914);">${progress}%</strong>
                        </div>
                        ${d.supporters ? `<p style="font-size:0.7rem;color:var(--accent);margin-top:0.3rem;">👥 ${d.supporters}명 참여</p>` : ''}
                    </div>`;
                list.appendChild(card);
            });
        } catch (e) {
            console.error('[fundraise] Load error:', e);
            list.innerHTML = `<p style="text-align:center;padding:2rem;color:#e53935;">로드 실패: ${e.message}</p>`;
        }
    };

    window.showCampaignDetail = function(id, data) {
        const modal = document.getElementById('campaign-detail-modal');
        const content = document.getElementById('campaign-detail-content');
        if (!modal || !content) return;

        const progress = data.goal ? Math.min(100, Math.round((data.raised || 0) / data.goal * 100)) : 0;
        content.innerHTML = `
            ${data.imageURL ? `<img src="${data.imageURL}" style="width:100%;border-radius:8px;margin-bottom:1rem;">` : ''}
            <h3 style="margin-bottom:0.5rem;">${data.title || '캠페인'}</h3>
            <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                ${data.category ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.category}</span>` : ''}
                ${data.country ? `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:var(--bg,#FFF8F0);border-radius:10px;">${data.country}</span>` : ''}
            </div>
            <p style="font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;white-space:pre-wrap;">${data.description || ''}</p>
            <div style="background:#F7F3ED;border-radius:6px;height:10px;overflow:hidden;margin-bottom:0.5rem;">
                <div style="height:100%;background:${progress >= 100 ? '#6B8F3C' : '#8B6914'};width:${progress}%;border-radius:6px;"></div>
            </div>
            <p style="font-size:0.85rem;margin-bottom:1rem;"><strong>${(data.raised||0).toLocaleString()}</strong> / ${(data.goal||0).toLocaleString()} CRTD (${progress}%)</p>
            <button onclick="donateToCampaign('${id}')" class="btn-primary" style="width:100%;padding:0.8rem;"><i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> 후원하기</button>
            <button onclick="document.getElementById('campaign-detail-modal').style.display='none'" style="width:100%;padding:0.6rem;margin-top:0.5rem;background:none;border:1px solid #E8E0D8;border-radius:8px;cursor:pointer;">닫기</button>`;
        modal.style.display = 'flex';
    };

    window.donateToCampaign = async function(campaignId) {
        if (!currentUser) { showToast('로그인이 필요합니다', 'warning'); return; }
        showToast('후원 기능 준비 중입니다', 'info');
    };

})();
