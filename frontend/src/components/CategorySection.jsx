import DishCard from "./DishCard";

function CategorySection({ category }) {
  return (
    <section className="category-section">
      <div className="category-heading">
        <h2>{category.name}</h2>

        {category.description && <p>{category.description}</p>}
      </div>

      <div className="dish-list">
        {category.dishes.length > 0 ? (
          category.dishes.map((dish) => <DishCard key={dish.id} dish={dish} />)
        ) : (
          <p className="empty-category">No dishes available.</p>
        )}
      </div>
    </section>
  );
}

export default CategorySection;
