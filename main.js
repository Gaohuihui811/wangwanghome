/**
 * 旺旺主页 — 相册管理（Supabase 云端版）
 *
 * 功能：
 *  - 图片上传到 Supabase Storage，所有人共享
 *  - 图片数据存储在 Supabase 数据库，多设备同步
 *  - 点击上传 + 拖拽上传
 *  - 格式校验（jpg / png / webp / gif）
 *  - 大小校验（最大 8MB）
 *  - 即时预览 & 瀑布流卡片
 *  - 单张删除
 *  - 大图弹窗（GIF 保持播放）
 */

;(function () {
  'use strict';

  // ---------- Supabase 配置 ----------
  const SUPABASE_URL = 'https://limyuyyrvgbmcgmiwkii.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpbXl1eXlydmdibWNnbWl3a2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NTM5OTksImV4cCI6MjEwMDUyOTk5OX0.qMJTK-W1Np0W0-4T87XQSw6Mc2FHeg4sIrLTjFjerUg';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---------- 常量 ----------
  const MAX_SIZE = 8 * 1024 * 1024; // 8MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // ---------- DOM 引用 ----------
  const galleryGrid = document.getElementById('galleryGrid');
  const galleryEmpty = document.getElementById('galleryEmpty');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalImage = document.getElementById('modalImage');
  const modalClose = document.getElementById('modalClose');

  // ---------- 数据 ----------
  let images = []; // { id: string, url: string, name: string }

  // ---------- 初始化 ----------
  function init() {
    loadFromSupabase();
    bindEvents();
  }

  // ---------- 从 Supabase 加载 ----------
  async function loadFromSupabase() {
    showLoading(true);
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('加载图片列表失败:', error);
        showToast('加载相册失败，请刷新页面重试', 'error');
        images = [];
      } else {
        images = data || [];
      }
    } catch (e) {
      console.error('加载异常:', e);
      showToast('网络连接失败，请检查网络后刷新', 'error');
      images = [];
    }
    showLoading(false);
    renderGallery();
  }

  // ---------- 渲染 ----------
  function renderGallery() {
    // 清空除 empty 外的所有子元素
    const cards = galleryGrid.querySelectorAll('.gallery-card');
    cards.forEach(function (c) { return c.remove(); });

    if (images.length === 0) {
      galleryEmpty.classList.remove('hidden');
    } else {
      galleryEmpty.classList.add('hidden');
      images.forEach(function (img) {
        galleryGrid.appendChild(createCard(img));
      });
    }
  }

  function createCard(imgData) {
    var card = document.createElement('div');
    card.className = 'gallery-card';
    card.setAttribute('data-id', imgData.id);

    var img = document.createElement('img');
    img.src = imgData.url;
    img.alt = imgData.name;
    img.loading = 'lazy';

    var delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerHTML = '🗑️';
    delBtn.title = '删除此照片';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteImage(imgData.id);
    });

    card.appendChild(img);
    card.appendChild(delBtn);

    // 点击卡片打开弹窗
    card.addEventListener('click', function () {
      openModal(imgData.url);
    });

    return card;
  }

  // ---------- 上传 ----------
  function handleFiles(files) {
    Array.from(files).forEach(async function (file) {
      // 格式校验
      if (ALLOWED_TYPES.indexOf(file.type) === -1) {
        showToast('"' + file.name + '" 格式不支持，请上传 JPG / PNG / WebP / GIF', 'warning');
        return;
      }
      // 大小校验
      if (file.size > MAX_SIZE) {
        showToast('"' + file.name + '" 超过 8MB 限制，请压缩后上传', 'error');
        return;
      }

      showToast('正在上传 "' + file.name + '" ...', '');

      // 生成唯一文件名（防止重名覆盖）
      var fileExt = file.name.split('.').pop();
      var fileName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + fileExt;

      // 上传到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('上传文件失败:', uploadError);
        showToast('上传失败: ' + uploadError.message, 'error');
        return;
      }

      // 获取公开访问 URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      var publicUrl = urlData.publicUrl;

      // 在数据库插入记录
      var imageId = generateId();
      const { error: dbError } = await supabase
        .from('images')
        .insert({
          id: imageId,
          url: publicUrl,
          name: file.name
        });

      if (dbError) {
        console.error('数据库写入失败:', dbError);
        // 尝试清理已上传的文件
        await supabase.storage.from('photos').remove([fileName]);
        showToast('保存失败，请重试', 'error');
        return;
      }

      // 重新加载
      showToast('"' + file.name + '" 上传成功！');
      loadFromSupabase();
    });

    // 重置 input 以允许重复选同一文件
    fileInput.value = '';
  }

  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ---------- 删除 ----------
  async function deleteImage(id) {
    var img = images.find(function (item) { return item.id === id; });
    if (!img) return;

    // 从 URL 中提取文件路径
    var urlParts = img.url.split('/');
    var filePath = urlParts[urlParts.length - 1];

    // 从数据库删除
    const { error: dbError } = await supabase
      .from('images')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('删除记录失败:', dbError);
      showToast('删除失败，请重试', 'error');
      return;
    }

    // 从 Storage 删除文件（可选，失败不影响）
    await supabase.storage.from('photos').remove([filePath]);

    images = images.filter(function (item) { return item.id !== id; });
    renderGallery();
    showToast('照片已删除');
  }

  // ---------- 弹窗 ----------
  function openModal(url) {
    modalImage.src = url;
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    modalImage.src = '';
    document.body.style.overflow = '';
  }

  // ---------- Loading ----------
  function showLoading(show) {
    var existing = document.querySelector('.gallery-loading');
    if (show) {
      if (!existing) {
        var loader = document.createElement('div');
        loader.className = 'gallery-loading';
        loader.innerHTML = '<span style="font-size:32px">⏳</span><p>加载相册中...</p>';
        galleryGrid.appendChild(loader);
      }
    } else {
      if (existing) existing.remove();
    }
  }

  // ---------- Toast ----------
  function showToast(msg, type) {
    if (type === void 0) type = '';
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 3000);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 点击上传
    uploadArea.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // 弹窗关闭
    modalClose.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // 键盘 ESC 关闭弹窗
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModal();
      }
    });
  }

  // ---------- 启动 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
