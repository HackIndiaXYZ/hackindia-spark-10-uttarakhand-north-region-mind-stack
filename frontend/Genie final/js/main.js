const features = [
  "Structured Notes",
  "Smart Summary",
  "Visual Mind Maps",
  "Interactive Flashcards",
  "Adaptive Quizzes",
  "Important Questions",
  "Smart Revision"
];

let fi = 0;
const ft = document.getElementById("featureText");
const fp = document.getElementById("featureProgress");

function cycleFeature() {
  if (!ft) return;
  ft.style.opacity = "0.15";
  ft.style.transform = "translateY(-8px)";
  setTimeout(() => {
    fi = (fi + 1) % features.length;
    ft.textContent = features[fi];
    ft.style.transform = "translateY(8px)";
    requestAnimationFrame(() => {
      ft.style.opacity = "1";
      ft.style.transform = "translateY(0)";
    });
  }, 250);

  if (fp) {
    fp.style.transition = "none";
    fp.style.width = "0";
    requestAnimationFrame(() => {
      fp.style.transition = "width 2s linear";
      fp.style.width = "100%";
    });
  }
}

if (ft) {
  ft.style.transition = "opacity .25s, transform .25s";
  ft.style.opacity = "1";
  cycleFeature();
  setInterval(cycleFeature, 2250);
}

const nav = document.getElementById("navbar");
window.addEventListener("scroll", () => nav?.classList.toggle("scrolled", window.scrollY > 30));

if ("IntersectionObserver" in window) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

const tilt = document.querySelector(".tilt-card");
const heroProduct = document.querySelector(".hero-product");
if (tilt && heroProduct && window.matchMedia("(pointer:fine)").matches) {
  heroProduct.addEventListener("mousemove", (event) => {
    const rect = tilt.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    tilt.style.transform = `perspective(1100px) rotateY(${x * 7 - 3}deg) rotateX(${-y * 5 + 2}deg)`;
  });
  heroProduct.addEventListener("mouseleave", () => {
    tilt.style.transform = "perspective(1100px) rotateY(-5deg) rotateX(3deg)";
  });
}

document.getElementById("menuBtn")?.addEventListener("click", () => {
  document.querySelector(".navbar nav")?.classList.toggle("mobile-open");
});
